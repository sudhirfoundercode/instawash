const QRCode = require('qrcode');
const crypto = require('crypto');

const generatePermanentQrCode = (studentId) => {
  const token = crypto.randomBytes(8).toString('hex');
  return `INSTAWASH:STUDENT:${studentId}:${token}`;
};

const renderQrDataUrl = async (qrString) => {
  try {
    return await QRCode.toDataURL(qrString, { errorCorrectionLevel: 'H', margin: 2, width: 300 });
  } catch (err) {
    console.error('Failed to render QR Code Data URL:', err);
    return null;
  }
};

module.exports = {
  generatePermanentQrCode,
  renderQrDataUrl,
};
