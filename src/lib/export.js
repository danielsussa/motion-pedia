const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

export function exportPng(player, name) {
  player.canvas.toBlob((b) => download(b, `${name}.png`), 'image/png');
}

const MIMES = ['video/mp4;codecs=avc1.640033', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

// Grava uma passada completa do motion em tempo real a partir do canvas do player.
export async function exportVideo(player, name, { fps = 60, bitrate = 20_000_000 } = {}) {
  const mimeType = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error('Este navegador não suporta MediaRecorder.');
  const stream = player.canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  const wasLoop = player.loop;
  player.pause();
  player.loop = false;
  player.seek(0);
  const ended = new Promise((r) => {
    const off = player.on('end', () => (off(), r()));
  });
  rec.start();
  player.play();
  await ended;
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  player.loop = wasLoop;

  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mimeType }), `${name}.${ext}`);
}
