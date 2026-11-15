# Funky Boys Portal

Portal der Funky Boys (TSG Rot-Weiße Funken Güsten e.V.). Statische Seite (GitHub Pages) + Firebase (Login, Firestore).

## Einrichtung
1. GitHub: Settings → Pages → Branch `main`, Ordner `/ (root)`.
2. Firebase-Konsole → Firestore → Regeln: Inhalt von `firestore.rules` einfügen, `ADMIN_EMAIL_HIER` durch die Admin-E-Mail ersetzen (nicht committen), veröffentlichen.
3. Firebase → Authentication → Anmeldemethode E-Mail/Passwort aktiv; unter Einstellungen die Domain `<user>.github.io` als autorisiert eintragen.
4. Als Admin anmelden, E-Mail bestätigen, `seed-private.json` im Import-Dialog hochladen.
5. In Verwaltung E-Mails der Mitglieder eintragen → „Logins abgleichen“.

## Updates
Dateien ändern, committen, pushen. Bei neuer Version `version.json` (build) erhöhen, dann erscheint der Update-Hinweis.

## Handy
Seite im Browser öffnen → „Zum Home-Bildschirm“ (iOS) bzw. „App installieren“ (Android).
