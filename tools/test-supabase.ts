/**
 * Testler için Supabase/PostgREST taklidi — yalnızca senkronun kullandığı
 * yüzey: `from().select().eq().gte().or().order().limit()`, `upsert()` ve
 * `delete().in()`.
 *
 * Taklit edilen sunucu davranışları, çünkü senkron hataları tam olarak
 * bunlardan doğuyor:
 *
 * - RLS: istek yalnızca oturumdaki kullanıcının satırlarını görür;
 *   başkasının satırını yazmaya çalışan upsert reddedilir.
 * - `touch_server_updated_at`: gelen `updated_at` sunucudakinden eskiyse
 *   satıra dokunulmaz ve HATA DÖNMEZ (bayat yazma sessizce atlanır).
 * - `now()` İŞLEM BAŞINA TEK damga: bir upsert isteğindeki bütün satırlar
 *   aynı `server_updated_at`'i alır. Sayfa sınırı hatası buradan doğuyordu.
 * - Mikrosaniye hassasiyet ve Postgres'in çıktı biçimi: kesirdeki sondaki
 *   sıfırlar atılır, kesir sıfırsa hiç yazılmaz, ofset `+00:00`.
 * - PostgREST `or` mantık ağacı: `a.gt."x",and(b.eq."x",c.gt."y")`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;

export interface ServerHooks {
  /** Her okuma isteği işlenmeden önce — tur ortasında yazma taklidi için. */
  beforeSelect?: (table: string) => void | Promise<void>;
  /** Upsert isteği "yoldayken" — sürücünün o anda düzenleme yapması için. */
  duringUpsert?: (table: string) => void | Promise<void>;
  /** Doluysa her upsert bu hatayla döner. */
  upsertError?: string | null;
  /** Tablo için okuma hatası döndürür. */
  selectError?: (table: string) => string | null;
}

/** Mikrosaniye cinsinden damgayı Postgres/PostgREST biçiminde yazar. */
export function formatServerTime(micros: number): string {
  const seconds = Math.floor(micros / 1_000_000);
  const fraction = micros - seconds * 1_000_000;
  const base = new Date(seconds * 1000).toISOString().slice(0, 19);
  const digits = String(fraction).padStart(6, '0').replace(/0+$/, '');
  return `${base}${digits ? `.${digits}` : ''}+00:00`;
}

const parsedTimes = new Map<string, number>();

function parseServerTime(text: string): number {
  const cached = parsedTimes.get(text);
  if (cached !== undefined) return cached;
  const value = parseServerTimeUncached(text);
  parsedTimes.set(text, value);
  return value;
}

function parseServerTimeUncached(text: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(text);
  if (!m) throw new Error(`taklit sunucu damgayı çözemedi: ${text}`);
  const seconds = Date.parse(`${m[1]}Z`) / 1000;
  return seconds * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
}

function compareColumn(column: string, a: unknown, b: unknown): number {
  if (column === 'server_updated_at') {
    return Math.sign(parseServerTime(String(a)) - parseServerTime(String(b)));
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

type Predicate = (row: Row) => boolean;

function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '\\') i += 1;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  if (quoted || depth !== 0) throw new Error(`bozuk or ifadesi: ${source}`);
  parts.push(source.slice(start));
  return parts;
}

function comparison(column: string, op: string, value: unknown): Predicate {
  return (row) => {
    const c = compareColumn(column, row[column], value);
    switch (op) {
      case 'eq': return c === 0;
      case 'gt': return c > 0;
      case 'gte': return c >= 0;
      case 'lt': return c < 0;
      case 'lte': return c <= 0;
      default: throw new Error(`taklit sunucu bu işleci tanımıyor: ${op}`);
    }
  };
}

/** PostgREST mantık ağacını çözer; tırnaksız değerde ayrılmış karakter varsa reddeder. */
function parseLogic(source: string, combine: 'and' | 'or'): Predicate {
  const terms = splitTopLevel(source).map((term): Predicate => {
    const nested = /^(and|or)\((.*)\)$/.exec(term);
    if (nested) return parseLogic(nested[2], nested[1] as 'and' | 'or');

    const m = /^([a-z_]+)\.(eq|gt|gte|lt|lte)\.(.*)$/.exec(term);
    if (!m) throw new Error(`bozuk koşul: ${term}`);
    let value = m[3];
    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length < 2) throw new Error(`bozuk tırnak: ${term}`);
      value = value.slice(1, -1).replace(/\\(.)/g, '$1');
    } else if (/[,.:()+]/.test(value)) {
      // Gerçek PostgREST burada ya hata verir ya da ifadeyi yanlış böler.
      throw new Error(`tırnaksız değerde ayrılmış karakter: ${term}`);
    }
    return comparison(m[1], m[2], value);
  });
  return combine === 'and'
    ? (row) => terms.every((t) => t(row))
    : (row) => terms.some((t) => t(row));
}

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

export class FakeSupabase {
  readonly tables = new Map<string, Map<string, Row>>();
  readonly log: string[] = [];
  readonly deleteCalls: { table: string; ids: string[] }[] = [];
  hooks: ServerHooks = {};
  sessionUser: string | null;

  /** Sunucu saati, mikrosaniye. Her istek (işlem) ilerletir. */
  clockMicros = Date.UTC(2026, 8, 19, 10, 0, 0) * 1000 + 123_456;
  tickMicros = 1_000_000;

  constructor(sessionUser: string | null) {
    this.sessionUser = sessionUser;
  }

  table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  row(table: string, id: string): Row | undefined {
    return this.table(table).get(id);
  }

  ids(table: string, userId?: string): Set<string> {
    return new Set([...this.table(table).values()]
      .filter((r) => userId === undefined || r.user_id === userId)
      .map((r) => String(r.id)));
  }

  /** Yeni bir işlemin `now()` değeri. */
  now(): string {
    this.clockMicros += this.tickMicros;
    return formatServerTime(this.clockMicros);
  }

  /**
   * Tek işlemde yazma — tetikleyicinin yaptığı gibi: bayat yazma atlanır,
   * diğer bütün satırlar AYNI damgayı alır. `at` verilirse o damga
   * kullanılır (geç commit edilen işlem taklidi).
   */
  write(table: string, rows: readonly Row[], at: string = this.now()): string {
    for (const incoming of rows) {
      const old = this.table(table).get(String(incoming.id));
      if (old && Number(incoming.updated_at) < Number(old.updated_at)) continue;
      this.table(table).set(String(incoming.id), { ...old, ...incoming, server_updated_at: at });
    }
    return at;
  }

  client(): SupabaseClient {
    const server = this;

    const from = (table: string) => {
      const filters: Predicate[] = [];
      const orders: { column: string; ascending: boolean }[] = [];
      let limit = Infinity;

      const run = async () => {
        server.log.push(`select ${table}`);
        await server.hooks.beforeSelect?.(table);
        await pause();
        const failure = server.hooks.selectError?.(table);
        if (failure) return { data: null, error: { message: failure } };

        const data = [...server.table(table).values()]
          .filter((r) => r.user_id === server.sessionUser) // RLS
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => {
            for (const o of orders) {
              const c = compareColumn(o.column, a[o.column], b[o.column]);
              if (c !== 0) return o.ascending ? c : -c;
            }
            return 0;
          })
          .slice(0, limit)
          .map((r) => ({ ...r }));
        return { data, error: null };
      };

      const query = {
        select() { return query; },
        eq(column: string, value: unknown) {
          filters.push(comparison(column, 'eq', value));
          return query;
        },
        gte(column: string, value: unknown) {
          filters.push(comparison(column, 'gte', value));
          return query;
        },
        or(expression: string) {
          filters.push(parseLogic(expression, 'or'));
          return query;
        },
        order(column: string, options: { ascending?: boolean } = {}) {
          orders.push({ column, ascending: options.ascending !== false });
          return query;
        },
        limit(n: number) {
          limit = n;
          return query;
        },
        then<A, B>(
          resolve: (value: Awaited<ReturnType<typeof run>>) => A,
          reject?: (reason: unknown) => B,
        ) {
          return run().then(resolve, reject);
        },
        async upsert(rows: Row[]) {
          server.log.push(`upsert ${table} x${rows.length}`);
          const payload = rows.map((r) => ({ ...r }));
          await pause();
          await server.hooks.duringUpsert?.(table);
          await pause();
          if (server.hooks.upsertError) return { error: { message: server.hooks.upsertError } };
          if (payload.some((r) => r.user_id !== server.sessionUser)) {
            return { error: { message: 'new row violates row-level security policy' } };
          }
          server.write(table, payload);
          return { error: null };
        },
        delete() {
          return {
            async in(_column: string, ids: string[]) {
              server.deleteCalls.push({ table, ids: [...ids] });
              for (const id of ids) server.table(table).delete(id);
              return { error: null };
            },
          };
        },
      };
      return query;
    };

    return { from } as unknown as SupabaseClient;
  }
}

/** Buluttaki bir `goals` satırı — yerel sütunların birebir karşılığı. */
export function cloudGoal(userId: string, id: string, overrides: Row = {}): Row {
  return {
    id, user_id: userId, created_at: 1, updated_at: 1, deleted_at: null,
    period: 'daily', target_net_kurus: 100, start_date: '2026-09-01',
    end_date: null, is_active: true,
    ...overrides,
  };
}

/** Buluttaki bir `app_settings` satırı. */
export function cloudSettings(userId: string, id: string, overrides: Row = {}): Row {
  return {
    id, user_id: userId, created_at: 1, updated_at: 1, deleted_at: null,
    day_cutoff_hour: 4, default_vehicle_id: null, region_code: 'TR',
    default_earning_source_id: null, onboarding_completed_at: null,
    ...overrides,
  };
}

/** Sıralı, geçerli UUID v7 biçiminde test kimliği. */
export function testId(prefix: number, n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `0199${prefix.toString(16).padStart(4, '0')}-0000-7000-8000-${hex}`;
}
