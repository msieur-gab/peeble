Peeble E2E Demo: Technical Documentation
This document provides a comprehensive overview of the Peeble end-to-end demo, a proof-of-concept for creating and playing secure, encrypted voice messages using NFC tags and IPFS.

1. Core Concept
The central security principle of Peeble is that the physical NFC tag acts as the decryption key. Messages are encrypted using a unique key derived from the tag's serial number. This ensures that only the original Peeble can unlock the message content, even if the public URL is shared.

2. The Writer App (Parent's Experience)
The Writer app is designed for parents to create secure messages. Its workflow is as follows:

Credentials & Setup: The app requires one-time setup of Pinata IPFS API credentials, which are stored locally in IndexedDB.

NFC Serial Capture: The app prompts the user to tap a blank NFC tag to capture its unique serial number. This serial is a crucial component of the encryption key and is stored locally in the browser's memory for the current session.

Message Recording: The parent can record multiple voice messages. These are stored temporarily in a local IndexedDB playlist.

Playlist Encryption & Upload: When the parent is ready, the app performs a multi-step security process:

Each message is encrypted individually using a key derived from the captured NFC serial and a unique timestamp.

Each encrypted message is uploaded to Pinata IPFS, generating a unique hash.

A final playlist manifest (a list of all the individual message hashes) is created and uploaded to Pinata.

NFC Tag Writing: The app generates a URL pointing to the final playlist manifest's IPFS hash. It then prompts the parent to re-tap the same Peeble to write this URL onto the tag. A security check is performed to ensure the serial of the tag being written to matches the original one, preventing accidental overwrites on the wrong Peeble.

3. The Player App (Child's Experience)
The Player app is designed for a simple, secure playback experience.

NFC Activation: The app initially prompts the user to activate the NFC reader. This is a critical step to gain the necessary browser permissions to listen for tags.

Reading the Peeble: When a Peeble is tapped to the device, the app's NFC reader intercepts the event. It reads the tag's serial number and the URL.

Secure Decryption: The app uses the URL to download the playlist manifest from IPFS. For each message listed in the manifest:

It downloads the individual encrypted message from IPFS.

It uses the serial number of the physical tag (the one that was just scanned) and the timestamp embedded in the encrypted file to derive the correct decryption key.

The message is decrypted and made available for playback.

4. Recommendation: Data Storage for the Player App
A key consideration for the Player app is how it handles downloaded message data, especially for children who may use shared devices.

Security Risk of Persistent Storage: Storing decrypted playlists in a persistent database (like IndexedDB) on a shared device would defeat the app's core security concept. Anyone with access to the device could then listen to the private messages without the physical Peeble.

Recommended Approach: The current demo is designed for maximum security by storing the decrypted audio only in a temporary, in-memory cache. This allows for smooth playback during a single session. When the browser tab is closed, the data is automatically discarded. This is the recommended default behavior for a production app, as it ensures that the physical Peeble remains the only key to the content.

Optional User Feature: As a future enhancement, a parent could be given an explicit, opt-in choice to enable permanent local storage for a specific device, along with a clear warning about the security implications. This would allow for a more convenient experience in a trusted, private device environment.