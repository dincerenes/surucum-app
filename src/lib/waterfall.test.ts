import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Kurus, ZERO, fromLira } from './money.ts';
import {
  type WaterfallInput, buildWaterfall, positionPx, revealPlan, segmentPx,
  waterfallA11yLabel, wearSentence,
} from './waterfall.ts';

const k = (lira: number): Kurus => fromLira(lira);

/** Brief'teki zararlı gün (Tur 3): cebe kalan −810,50, gerçek kâr −1.405,50. */
const NEGATIVE_DAY: WaterfallInput = {
  revenue: k(447.5),
  commission: k(215.5),
  fuel: k(892.5),
  expenses: k(150),
  cashProfit: k(-810.5),
  wearShare: k(595),
  trueProfit: k(-1405.5),
  wearKnown: true,
};

describe('buildWaterfall', () => {
  it('satırlar özetin sırasında ve yalnızca özetin sözlüğüyle', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    assert.deepEqual(
      m.steps.map((s) => s.label),
      ['Ciro', 'Komisyon', 'Yakıt', 'Gider', 'Cebe kalan', 'Yıpranma', 'Gerçek kâr'],
    );
  });

  it('kesintiler önceki toplamın bittiği yerden düşer', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    const [ciro, komisyon, yakit, gider, cebe, yipranma, gercek] = m.steps;
    assert.equal(ciro.from, 0);
    assert.equal(ciro.to, 44_750);
    assert.equal(komisyon.from, 44_750);
    assert.equal(komisyon.to, 23_200);
    assert.equal(yakit.from, 23_200);
    assert.equal(yakit.to, -66_050);
    assert.equal(gider.to, -81_050);
    // Cebe kalan çubuğu sıfırdan, özetin kendi sayısına.
    assert.equal(cebe.from, 0);
    assert.equal(cebe.to, -81_050);
    // Yıpranma cebe kalanın bittiği yerden düşer.
    assert.equal(yipranma.from, -81_050);
    assert.equal(yipranma.to, -140_550);
    assert.equal(gercek.to, -140_550);
  });

  it('NEGATİF günde eksen en düşük toplamı ve ciroyu birlikte kapsar', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    assert.equal(m.max, 44_750);
    assert.equal(m.min, -140_550);
  });

  it('büyük rakam gerçek kâr — sıfıra kırpılmaz', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    assert.deepEqual(m.headline, { label: 'Gerçek kâr', value: -140_550 });
  });

  it('kesintiler eksi işaretli taşınır', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    assert.equal(m.steps[1].signed, -21_550);
    assert.equal(m.steps[5].signed, -59_500);
  });

  it('sıfır kesinti çizilmez, ciro ve toplamlar çizilir', () => {
    const m = buildWaterfall({
      revenue: ZERO, commission: ZERO, fuel: ZERO, expenses: k(50),
      cashProfit: k(-50), wearShare: ZERO, trueProfit: k(-50), wearKnown: true,
    });
    assert.deepEqual(
      m.steps.map((s) => s.key),
      ['revenue', 'expenses', 'cash', 'true'],
    );
  });

  it('kilometre girilmediyse yıpranma ve gerçek kâr çubuğu YOK, büyük rakam cebe kalan', () => {
    const m = buildWaterfall({
      ...NEGATIVE_DAY, wearShare: ZERO, trueProfit: k(-810.5), wearKnown: false,
    });
    assert.deepEqual(
      m.steps.map((s) => s.key),
      ['revenue', 'commission', 'fuel', 'expenses', 'cash'],
    );
    assert.deepEqual(m.headline, { label: 'Cebe kalan', value: -81_050 });
    assert.equal(m.min, -81_050);
  });

  it('kârlı günde eksen sıfırın altına inmez', () => {
    const m = buildWaterfall({
      revenue: k(3000), commission: k(600), fuel: k(500), expenses: ZERO,
      cashProfit: k(1900), wearShare: k(400), trueProfit: k(1500), wearKnown: true,
    });
    assert.equal(m.min, 0);
    assert.equal(m.max, 300_000);
  });
});

describe('positionPx', () => {
  const domain = { min: -100, max: 300 };

  it('sınırlar uçlara, sıfır orantılı yere düşer', () => {
    assert.equal(positionPx(-100, domain, 400), 0);
    assert.equal(positionPx(300, domain, 400), 400);
    assert.equal(positionPx(0, domain, 400), 100);
  });

  it('aralık dışı değer kırpılır', () => {
    assert.equal(positionPx(-500, domain, 400), 0);
    assert.equal(positionPx(900, domain, 400), 400);
  });

  it('tamamen sıfır eksende patlamaz', () => {
    assert.equal(positionPx(0, { min: 0, max: 0 }, 400), 0);
  });
});

describe('segmentPx', () => {
  it('çubuklar hiçbir zaman izden taşmaz — negatif gün', () => {
    const m = buildWaterfall(NEGATIVE_DAY);
    for (const width of [0, 1, 3, 120, 260]) {
      for (const s of m.steps) {
        const { start, end } = segmentPx(s, m, width, 3);
        assert.ok(Math.min(start, end) >= 0, `${s.label} sola taştı (${width})`);
        assert.ok(Math.max(start, end) <= width, `${s.label} sağa taştı (${width})`);
      }
    }
  });

  it('kesinti sağdan sola, önceki toplamın ucundan büyür', () => {
    const domain = { min: 0, max: 1000 };
    assert.deepEqual(segmentPx({ from: 1000, to: 800 }, domain, 100, 3), { start: 100, end: 80 });
  });

  it('negatif toplam sıfır çizgisinden sola uzanır', () => {
    const domain = { min: -500, max: 500 };
    assert.deepEqual(segmentPx({ from: 0, to: -250 }, domain, 200, 3), { start: 100, end: 50 });
  });

  it('küçük kalem en az minPx çizilir ve kenarda içeri kaydırılır', () => {
    const domain = { min: 0, max: 100_000 };
    // Ciro ucundan 5 ₺: genişlik 0,02 px olurdu.
    const s = segmentPx({ from: 100_000, to: 99_500 }, domain, 100, 3);
    assert.equal(Math.abs(s.end - s.start), 3);
    assert.ok(Math.max(s.start, s.end) <= 100);
    // Sol kenarda sıfırdan büyüyen küçük çubuk da taşmaz.
    const t = segmentPx({ from: 0, to: 10 }, domain, 100, 3);
    assert.deepEqual(t, { start: 0, end: 3 });
  });

  it('sıfır tutar sıfır genişlik', () => {
    const s = segmentPx({ from: 0, to: 0 }, { min: 0, max: 10 }, 100, 3);
    assert.equal(s.start, s.end);
  });
});

describe('revealPlan', () => {
  it('yedi satır 2,5 saniyede biter', () => {
    const p = revealPlan(7);
    assert.equal(p.delays.length, 7);
    assert.ok(p.end <= 2500, `bitiş ${p.end}`);
  });

  it('satırlar sırayla başlar', () => {
    const p = revealPlan(5);
    for (let i = 1; i < p.delays.length; i++) assert.ok(p.delays[i] > p.delays[i - 1]);
  });

  it('az satırda aralık üst sınırı aşmaz', () => {
    const p = revealPlan(2);
    assert.equal(p.delays[1] - p.delays[0], 380);
  });

  it('boş planda patlamaz', () => {
    assert.deepEqual(revealPlan(0), { delays: [], end: 0 });
  });
});

describe('wearSentence', () => {
  it('gerçek sayılarla tek cümle', () => {
    assert.equal(wearSentence(238, k(595)), "Aracın bu vardiyada 238 km'de 595 ₺ eridi.");
  });

  it('küsurat yuvarlanmaz', () => {
    assert.equal(
      wearSentence(1240, k(3100.4)),
      "Aracın bu vardiyada 1.240 km'de 3.100,40 ₺ eridi.",
    );
  });

  it('kilometre ya da pay yoksa cümle yok — uydurulmaz', () => {
    assert.equal(wearSentence(null, k(595)), null);
    assert.equal(wearSentence(0, k(595)), null);
    assert.equal(wearSentence(238, ZERO), null);
  });
});

describe('waterfallA11yLabel', () => {
  it('büyük rakam başta, her çubuk işaretiyle', () => {
    const label = waterfallA11yLabel(buildWaterfall(NEGATIVE_DAY));
    assert.ok(label.startsWith('Gerçek kâr −1.405,50 ₺, Ciro 447,50 ₺'));
    assert.ok(label.includes('Yıpranma −595,00 ₺'));
    assert.ok(!label.includes('Net'));
  });
});
