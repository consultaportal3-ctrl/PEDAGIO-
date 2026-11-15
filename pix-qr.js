/* Generate a payment QR locally from the exact Pix copy-and-paste payload. */
((root) => {
  const factory = typeof module === 'object' && module.exports ? require('./vendor/qrcode') : root.qrcode;
  function pixQrDataUrl(payload) {
    if (typeof payload !== 'string' || !payload.startsWith('000201') || payload.length > 4096) throw new Error('Código Pix inválido.');
    if (typeof factory !== 'function') throw new Error('Gerador QR indisponível.');
    factory.stringToBytes = text => Array.from(new TextEncoder().encode(text));
    const qr = factory(0, 'M');
    qr.addData(payload, 'Byte');
    qr.make();
    return qr.createDataURL(5, 20);
  }
  if (typeof module === 'object' && module.exports) module.exports = pixQrDataUrl;
  else root.pixQrDataUrl = pixQrDataUrl;
})(typeof window === 'object' ? window : globalThis);
