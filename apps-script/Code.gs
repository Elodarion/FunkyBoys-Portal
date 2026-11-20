/**
 * Funky Boys Portal – Google Apps Script (Dateiablage in Drive + Mailversand).
 * Läuft im Google-Konto der Funky Boys. Jede Anfrage trägt das Firebase-Login-Token
 * des Portal-Nutzers; das Skript prüft es und schaut nach, ob die Adresse im Portal freigeschaltet ist.
 * Neu: Schreiben mit KI (Aktion ai: kostenlos mit Gemini oder mit Claude, Schlüssel in den Skripteigenschaften). Posteingang lesen, im Verlauf antworten, als gelesen markieren, in Gmail-Ordner (Labels) ablegen, in den Papierkorb (Gmail der Gruppe).
 * Es sind keine Passwörter oder Schlüssel nötig (der Firebase-Webschlüssel ist öffentlich).
 */
const FIREBASE_API_KEY = 'AIzaSyACAImQ3HoiXHNIK8QAmioE8VEoIWa4voA';
const PROJECT_ID = 'funkyboys-portal';
const ROOT_NAME = 'Funky Boys Portal';
const SENDER_NAME = 'Funky Boys';
const FOLDERS = ['Anmeldungen', 'Belege & Verträge', 'Musik', 'Kostüme', 'Fotos & Videos', 'Sonstiges'];
const MAX_BYTES = 20 * 1024 * 1024;

/** Einmal im Editor ausführen: fragt die Berechtigungen ab und legt die Ordner an. */
function setup() {
  FOLDERS.forEach(getFolder_);
  MailApp.getRemainingDailyQuota();
  GmailApp.getInboxUnreadCount();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Fertig. Ordner "' + ROOT_NAME + '" liegt in deinem Drive.');
}

function doGet() { return out_({ ok: true, info: 'Funky Boys Portal Skript läuft.' }); }

function doPost(e) {
  try {
    const r = JSON.parse(e.postData.contents), u = auth_(r.token);
    switch (r.action) {
      case 'upload': return out_(upload_(r, u));
      case 'download': return out_(download_(r));
      case 'delete': return out_(delete_(r, u));
      case 'mail': return out_(mail_(r, u));
      case 'inbox': return out_(inbox_(r, u));
      case 'reply': return out_(reply_(r, u));
      case 'read': return out_(read_(r, u));
      case 'file': return out_(file_(r, u));
      case 'trash': return out_(trash_(r, u));
      case 'ai': return out_(ai_(r, u));
      default: throw new Error('Unbekannte Aktion.');
    }
  } catch (err) { return out_({ ok: false, error: String(err && err.message || err) }); }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Prüft das Login-Token und die Freischaltung im Portal. */
function auth_(token) {
  if (!token) throw new Error('Nicht angemeldet.');
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true });
  const us = (JSON.parse(res.getContentText()).users || [])[0];
  if (!us || !us.emailVerified) throw new Error('Anmeldung ungültig.');
  const email = String(us.email).toLowerCase();
  const fr = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/allowed/' + encodeURIComponent(email),
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (fr.getResponseCode() !== 200) throw new Error('Diese Adresse ist im Portal nicht freigeschaltet.');
  const f = JSON.parse(fr.getContentText()).fields || {};
  return { email: email, adm: !!(f.adm && f.adm.booleanValue), rolle: (f.rolle && f.rolle.stringValue) || '' };
}

function root_() {
  const it = DriveApp.getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
}
function getFolder_(name) {
  const root = root_(), n = FOLDERS.indexOf(name) >= 0 ? name : 'Sonstiges', it = root.getFoldersByName(n);
  return it.hasNext() ? it.next() : root.createFolder(n);
}
function inRoot_(file) {
  const rootId = root_().getId(); let level = [file];
  for (let d = 0; d < 4 && level.length; d++) {
    const next = [];
    for (const x of level) { const ps = x.getParents(); while (ps.hasNext()) { const p = ps.next(); if (p.getId() === rootId) return true; next.push(p); } }
    level = next;
  }
  return false;
}
function fileOf_(id) {
  const f = DriveApp.getFileById(String(id));
  if (!inRoot_(f)) throw new Error('Datei nicht gefunden.');
  return f;
}

function upload_(r, u) {
  const bytes = Utilities.base64Decode(r.b64 || '');
  if (!bytes.length) throw new Error('Die Datei ist leer.');
  if (bytes.length > MAX_BYTES) throw new Error('Die Datei ist größer als 20 MB.');
  const name = String(r.name || 'Datei').slice(0, 150);
  const file = getFolder_(r.ordner).createFile(Utilities.newBlob(bytes, r.mime || 'application/octet-stream', name));
  file.setDescription(u.email);
  return { ok: true, id: file.getId(), size: bytes.length };
}
function download_(r) {
  const f = fileOf_(r.id), blob = f.getBlob();
  return { ok: true, name: f.getName(), mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
}
function delete_(r, u) {
  const f = fileOf_(r.id);
  if (!u.adm && f.getDescription() !== u.email) throw new Error('Nur der Admin oder wer die Datei hochgeladen hat, darf sie entfernen.');
  f.setTrashed(true);
  return { ok: true };
}
function mail_(r, u) {
  if (!u.adm && u.rolle !== 'trainerin' && u.rolle !== 'admin') throw new Error('Du darfst im Namen der Gruppe keine Mails verschicken.');
  const an = String(r.an || '').trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(an)) throw new Error('Die Empfängeradresse sieht nicht richtig aus.');
  const betreff = String(r.betreff || '').trim().slice(0, 200), text = String(r.text || '').trim().slice(0, 20000);
  if (!betreff || !text) throw new Error('Betreff und Text dürfen nicht leer sein.');
  MailApp.sendEmail({ to: an, subject: betreff, body: text, name: SENDER_NAME });
  return { ok: true };
}

/* ---------- Schreiben mit KI (Social Media) ---------- */
// Kostenlos: Gemini (Schlüssel von aistudio.google.com) unter Projekteinstellungen > Skripteigenschaften > GEMINI_KEY.
// Alternativ Claude über die Anthropic-API (kostet Geld): Skripteigenschaft ANTHROPIC_KEY. Ist beides gesetzt, gilt GEMINI_KEY.
const AI_MODEL = 'claude-sonnet-5-5';
const GEMINI_MODEL = 'gemini-2.5-flash';
const AI_DAILY_LIMIT = 150;
function ai_(r, u) {
  if (!u.adm && u.rolle !== 'trainerin' && u.rolle !== 'admin') throw new Error('Das Schreiben mit KI dürfen die Trainerinnen und der Admin.');
  const props = PropertiesService.getScriptProperties(), gk = props.getProperty('GEMINI_KEY'), ak = props.getProperty('ANTHROPIC_KEY');
  if (!gk && !ak) throw new Error('KEY_FEHLT');
  const prompt = String(r.prompt || '').trim().slice(0, 12000); if (!prompt) throw new Error('Der Auftrag darf nicht leer sein.');
  const day = 'ai_' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyyMMdd'), n = +props.getProperty(day) || 0;
  if (n >= AI_DAILY_LIMIT) throw new Error('Das Tageslimit für die KI ist erreicht. Morgen geht es weiter.');
  props.setProperty(day, String(n + 1));
  if (gk) {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (props.getProperty('GEMINI_MODEL') || GEMINI_MODEL) + ':generateContent', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': gk }, payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1500, temperature: 0.9 } }) });
    const code = res.getResponseCode(); let body = {}; try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
    if (code === 429) throw new Error('Die kostenlose KI ist gerade ausgelastet oder für heute ausgeschöpft. Bitte später noch einmal versuchen.');
    if (code === 400 || code === 401 || code === 403) throw new Error('Der KI-Schlüssel wurde nicht akzeptiert. Bitte im Skript neu eintragen.');
    if (code >= 300) throw new Error('Die KI hat nicht geantwortet (Fehler ' + code + ').');
    const parts = (((body.candidates || [])[0] || {}).content || {}).parts || [];
    return { ok: true, provider: 'gemini', text: parts.map(function (p) { return p.text || ''; }).join('').trim() };
  }
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': ak, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: props.getProperty('ANTHROPIC_MODEL') || AI_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }) });
  const code = res.getResponseCode(), body = JSON.parse(res.getContentText() || '{}');
  if (code === 429) throw new Error('Claude ist gerade ausgelastet. Bitte in ein paar Minuten noch einmal versuchen.');
  if (code === 401 || code === 403) throw new Error('Der Claude-Schlüssel wurde nicht akzeptiert. Bitte im Skript neu eintragen.');
  if (code >= 300) throw new Error('Claude hat nicht geantwortet (Fehler ' + code + ').');
  return { ok: true, provider: 'claude', text: (body.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim() };
}

/* ---------- Posteingang (Gmail der Gruppe) ---------- */
function mayMail_(u) {
  if (!u.adm && u.rolle !== 'trainerin' && u.rolle !== 'admin') throw new Error('Du darfst das Postfach der Gruppe nicht lesen.');
}
function me_() { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); }
function parseFrom_(f) {
  f = String(f || ''); const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(f);
  return m ? { name: m[1].trim(), mail: m[2].trim().toLowerCase() } : { name: '', mail: f.trim().toLowerCase() };
}
function stripQuote_(t) {
  t = String(t || '').replace(/\r/g, ''); const cut = t.search(/\n(Am .{5,90} schrieb|On .{5,90} wrote|-{2,} ?(Original|Ursprüngliche)|Von: .+\nGesendet:)/);
  if (cut > 0) t = t.slice(0, cut);
  return t.split('\n').filter(function (l) { return l.charAt(0) !== '>'; }).join('\n').trim();
}
/** Letzte Mails im Posteingang. Nichts davon wird im Portal gespeichert, es wird jedes Mal live abgefragt. */
function inbox_(r, u) {
  mayMail_(u); const mine = me_(), out = [];
  GmailApp.search('in:inbox -category:promotions -category:social newer_than:60d', 0, 25).forEach(function (th) {
    const ms = th.getMessages(), last = ms[ms.length - 1], f = parseFrom_(last.getFrom());
    out.push({ id: th.getId(), msgId: last.getId(), name: f.name, mail: f.mail, own: f.mail === mine, subject: th.getFirstMessageSubject().slice(0, 200), date: last.getDate().getTime(),
      unread: th.isUnread(), count: ms.length, files: last.getAttachments().length, body: stripQuote_(last.getPlainBody()).slice(0, 3500) });
  });
  return { ok: true, threads: out, labels: GmailApp.getUserLabels().map(function (l) { return l.getName(); }).sort() };
}
/** Antwortet im bestehenden Verlauf an den letzten Absender, der nicht die Gruppe selbst ist. */
function reply_(r, u) {
  mayMail_(u); const text = String(r.text || '').trim().slice(0, 20000); if (!text) throw new Error('Der Text darf nicht leer sein.');
  const th = GmailApp.getThreadById(String(r.id)); if (!th) throw new Error('Mail nicht gefunden.');
  const ms = th.getMessages(), mine = me_(); let target = null;
  for (let i = ms.length - 1; i >= 0; i--) { if (parseFrom_(ms[i].getFrom()).mail !== mine) { target = ms[i]; break; } }
  if (!target) throw new Error('In diesem Verlauf gibt es nichts, worauf du antworten kannst.');
  target.reply(text, { name: SENDER_NAME }); th.markRead();
  return { ok: true };
}
function read_(r, u) {
  mayMail_(u); const th = GmailApp.getThreadById(String(r.id)); if (!th) throw new Error('Mail nicht gefunden.'); th.markRead(); return { ok: true };
}
/** Legt den Verlauf unter einem Gmail-Ordner (Label) ab, legt ihn bei r.create neu an, und nimmt ihn aus dem Posteingang. Ohne Label wird nur archiviert. */
function file_(r, u) {
  mayMail_(u); const th = GmailApp.getThreadById(String(r.id)); if (!th) throw new Error('Mail nicht gefunden.');
  const name = String(r.label || '').trim();
  if (name) {
    let lb = GmailApp.getUserLabelByName(name);
    if (!lb) { if (!r.create) throw new Error('Den Ordner „' + name + '“ gibt es in Gmail nicht.'); if (name.length > 100) throw new Error('Der Ordnername ist zu lang.'); lb = GmailApp.createLabel(name); }
    th.addLabel(lb);
  }
  th.markRead(); th.moveToArchive(); return { ok: true };
}
/** Papierkorb, nicht endgültig gelöscht: Gmail hält die Mail noch 30 Tage. */
function trash_(r, u) {
  mayMail_(u); const th = GmailApp.getThreadById(String(r.id)); if (!th) throw new Error('Mail nicht gefunden.'); th.moveToTrash(); return { ok: true };
}
