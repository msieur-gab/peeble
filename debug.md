```const fakeSerial = '04:A6:49:15:3F:58:80'; // You can use any unique string here
const event = new CustomEvent('blank-nfc-scanned', {
    detail: { serial: fakeSerial }
});
window.dispatchEvent(event);```
