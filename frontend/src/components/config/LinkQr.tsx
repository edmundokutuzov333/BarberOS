import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useShop } from '@/lib/shop';
import { Button } from '@/components/ui/Button';

export function LinkQr({ onDone }: { onDone?: () => void }) {
  const { shop } = useShop();
  const url = `${window.location.origin}/barbearia/${shop!.slug}`;
  const qrRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => { await navigator.clipboard.writeText(url); toast.success('Link copiado'); };

  const poster = async () => {
    setBusy(true);
    try {
      const qr = qrRef.current?.querySelector('canvas');
      if (!qr) throw new Error();
      const W = 1748, H = 2480;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d')!;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim() || '#b59eff';
      const glow = getComputedStyle(document.documentElement).getPropertyValue('--canvas-glow-a').trim() || '#1a102f';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H * 0.9); g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const font = (w: number, s: number) => `${w} ${s}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.font = font(500, 150);
      const name = shop!.name;
      ctx.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, W / 2, 380);
      ctx.font = font(300, 64); ctx.fillStyle = '#9b95a8';
      ctx.fillText('Marca o teu corte em 30 segundos', W / 2, 500);
      const box = 1100, bx = (W - box) / 2, by = 720;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(bx, by, box, box, 72); ctx.fill();
      ctx.drawImage(qr, bx + 80, by + 80, box - 160, box - 160);
      ctx.fillStyle = accent; ctx.font = font(500, 60);
      ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, by + box + 170);
      ctx.fillStyle = '#9b95a8'; ctx.font = font(300, 48);
      ctx.fillText('Lê o código com a câmara do telemóvel. Sem app, sem conta.', W / 2, by + box + 260);
      ctx.fillStyle = '#fff'; ctx.font = font(600, 56); ctx.textAlign = 'right';
      ctx.fillText('BarberOS', W / 2 + 60, H - 160);
      ctx.fillStyle = 'rgba(155,149,168,.8)'; ctx.font = font(300, 40); ctx.textAlign = 'left';
      ctx.fillText('by Oryon', W / 2 + 80, H - 160);
      const a = document.createElement('a'); a.download = `cartaz-${shop!.slug}.png`; a.href = c.toDataURL('image/png'); a.click();
      toast.success('Cartaz A5 descarregado');
    } catch { toast.error('Não foi possível gerar o cartaz. Tenta de novo.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start" data-testid="link-qr">
      <div ref={qrRef} className="bg-white rounded-2xl p-4 w-fit mx-auto md:mx-0" data-testid="qr-code">
        <QRCodeCanvas value={url} size={1024} level="M" includeMargin={false} style={{ width: 208, height: 208 }} />
      </div>
      <div className="space-y-4 min-w-0">
        <div>
          <span className="t-label text-ink-mid mb-1.5 block">Link público</span>
          <div className="flex gap-2">
            <input data-testid="public-link-input" readOnly value={url} className="field flex-1 min-w-0 text-ink-hi font-normal" onFocus={(e) => e.target.select()} />
            <Button data-testid="copy-public-link-btn" variant="secondary" onClick={copy} aria-label="Copiar link"><Copy size={15} /></Button>
            <a href={url} target="_blank" rel="noreferrer"><Button data-testid="open-public-link-btn" variant="secondary" aria-label="Abrir página pública"><ExternalLink size={15} /></Button></a>
          </div>
        </div>
        <p className="t-body text-ink-mid">Cola o link na bio do Instagram e no estado do WhatsApp. Imprime o cartaz para o espelho e o balcão: é aí que o cliente decide marcar.</p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="download-poster-btn" loading={busy} onClick={poster}><Download size={15} />Descarregar cartaz A5</Button>
          {onDone && <Button data-testid="link-done-btn" variant="secondary" onClick={onDone}>Concluir configuração</Button>}
        </div>
      </div>
    </div>
  );
}
