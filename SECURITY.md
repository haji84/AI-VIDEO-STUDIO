# Security policy / safe defaults

- Repository private initially; no publication implied.
- Never add raw footage, commercial audio, private training content, voice-clone samples, GPS, personal identifiers, cloud credentials, GitHub tokens or access keys.
- Never embed owner's device paths or secrets in shipped client UI or test fixtures. Historical examples must remain synthetic.
- Prefer local data. Remote upload requires affirmative choice, destination display and retention controls.
- Cloud services, charges, user access, production deployment and account settings are deferred and separately approved.
- Every external model, BGM/SE pack and voice license must allow the intended form of distribution before bundling.
- Detect and block access to another account's objects in any later SaaS implementation.
- A green unit test does not prove security or a real-device E2E.
