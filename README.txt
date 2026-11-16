PRINT RECORD MANAGER — Firebase Edition
=======================================

Project files
-------------
index.html          Website structure and sign-in controls
style.css           Responsive design and receipt/print styles
app.js              Work items, pricing, receipt history and Firebase operations
firebase-config.js  Existing Firebase web app configuration
firestore.rules     Owner-UID-only database rules

Work and pricing
----------------
- Each printing row is a separate job: 1–50 pages costs ৳3/page; over 50
  pages costs ৳2.80/page for every page in that job.
- Spiral Binding costs ৳35 per binding.
- Other Work requires a manually entered amount.
- Amounts are always editable. After an amount is changed manually, changing
  its quantity or work type will not replace that amount.
- Receipt totals update as work items change. Receipt numbers are allocated
  transactionally when a new receipt is saved.

Firebase project and authentication
-----------------------------------
The existing web configuration is for project printer-de188. Its web API key
is browser configuration, not a database access credential; Firestore Rules
must enforce access. The application uses Firebase Email/Password sign-in.
It does not sign in anonymously and does not provide public account creation.

One-time Firebase Console setup
-------------------------------
1. Open https://console.firebase.google.com/ and select printer-de188.
2. Go to Authentication > Sign-in method and enable Email/Password.
3. Go to Authentication > Users > Add user. Create the owner's email/password
   account. Do not provide public sign-up for this private business app.
4. Copy that owner's UID from Authentication > Users.
5. Confirm the owner UID in this project's firestore.rules exactly matches
   the copied UID (keep the quotes). The file is preconfigured with the UID
   supplied for this project; replace it if the account UID is different.
   Publish the complete rules in Firestore Database > Rules.
6. Confirm Firestore Database is created in the same project.
7. Serve the project from localhost or Firebase Hosting (ES modules do not
   work reliably when index.html is opened directly from disk).
8. Sign in on the website with the owner email/password and confirm the status
   says Connected.

Security and existing data
--------------------------
Anonymous Authentication does not establish a verified business owner: any
visitor could obtain an anonymous UID. The previous starter rules allowed any
authenticated user, including anonymous users, to access all receipts. The
new rules allow receipts and the serial counter only when the signed-in UID
matches the owner UID explicitly configured in the rules. Receipt records do
not need a new ownership field, so records already in the receipts collection
remain accessible to the configured owner.

Until Email/Password is enabled, the owner user is created, and matching rules
are published, cloud access will fail. This project has not published changes
to Firebase; deploy the rules only after checking the owner UID carefully.

Backup / restore
----------------
Backup downloads the receipts currently loaded from Firestore. Restore
updates documents by their saved Firestore ID; backups without IDs are
rejected instead of silently creating duplicates.

Manual verification checklist
-----------------------------
[ ] Add a print item: 20 pages = ৳60.
[ ] Add a print item: 50 pages = ৳150.
[ ] Add a separate print item: 60 pages = ৳168.
[ ] Add a separate print item: 100 pages = ৳280.
[ ] Add 2 Spiral Binding items/quantity = ৳70.
[ ] Add Other Work with a manually entered amount.
[ ] Change an amount manually, then change quantity/type; amount stays put.
[ ] Add multiple items, remove one, and verify total recalculates.
[ ] Save and reload a receipt from Firestore.
[ ] Edit a saved receipt and verify it updates rather than duplicates.
[ ] Delete a saved receipt.
[ ] Search receipts by customer and receipt number.
[ ] Print a new receipt and a saved receipt / choose Save as PDF.
[ ] Sign in with the configured owner UID and verify Firebase connection.
[ ] Verify a different authenticated UID and a signed-out visitor are denied
    by the Firestore Rules simulator or a separate test account.
