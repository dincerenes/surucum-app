-- Tetikleyici fonksiyonunu sıkılaştır.
--
-- İki sorun vardı:
-- 1) SECURITY DEFINER gereksizdi. Fonksiyon yalnızca NEW üzerinde bir sütun
--    set ediyor; ayrıcalıklı erişime ihtiyacı yok. INVOKER yeterli ve
--    ayrıcalık yükseltme yüzeyini tamamen kaldırıyor.
-- 2) PostgREST public şemasındaki fonksiyonları RPC olarak yayınlıyor, yani
--    /rest/v1/rpc/touch_server_updated_at oturum açmamış kullanıcıya bile
--    açıktı. Tetikleyici fonksiyonunun dışarıdan çağrılabilir olması için
--    hiçbir sebep yok — EXECUTE yetkisini geri alıyoruz.
--
-- Tetikleyiciler yetki denetimine tabi değildir; EXECUTE geri alınsa da
-- tablo üzerindeki tetikleyiciler çalışmaya devam eder.

create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;  -- bayat yazma: satıra dokunma
  end if;
  new.server_updated_at := now();
  return new;
end;
$fn$;

revoke execute on function public.touch_server_updated_at() from public;
revoke execute on function public.touch_server_updated_at() from anon;
revoke execute on function public.touch_server_updated_at() from authenticated;
