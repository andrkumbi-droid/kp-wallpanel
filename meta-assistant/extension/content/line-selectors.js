// ALLES DOM-WISSEN ÜBER DEN LINE OFFICIAL ACCOUNT MANAGER STEHT IN DIESER DATEI.
// Ändert LINE sein Markup, wird nur hier nachgezogen — wie selectors.js für Meta.
//
// Am 19.09.2026 am echten OA Manager (chat.line.biz) gemessen, nicht geraten.
// LINE ist dabei deutlich gutmütiger als die Business Suite:
//
//   · Das Datei-Feld liegt FEST im Dokument (versteckt, mit `multiple`). Bei
//     Meta gibt es das erst nach einem Klick, weshalb dort main-hook.js in der
//     Seiten-Welt laufen muss. Hier reicht ein normales Content-Script.
//   · Nach dem Anhängen kommt ein BESTÄTIGUNGSDIALOG mit Vorschaubildern und
//     einem Senden-Knopf. Dadurch weiß man vor dem Absenden genau, wie viele
//     Bilder LINE angenommen hat — bei Meta musste man das aus Dateinamen-
//     zeilen erraten.
//   · Ob die Bilder wirklich rausgingen, sagt der Gesprächsverlauf selbst:
//     jede Bildnachricht ist ein `.chat-media-link`. Kein Fortschrittsbalken-
//     Raten wie bei Meta, wo lautlos 25 von 29 Fotos ankamen.
//
// Sprachunabhängigkeit: Der Posteingang läuft im Büro je nach Konto auf Thai
// oder Englisch. Deshalb wird NIRGENDS auf Text geprüft, wo es auch anders
// geht — der Bestätigungsdialog wird an seinen Bildzeilen erkannt, nicht an
// der Überschrift.

// Das versteckte Datei-Feld in der Fußleiste (#editable-unit .editable-btn).
function kpLineFileInput() {
  return document.querySelector('#editable-unit input[type="file"]')
      || document.querySelector('input[type="file"]');
}

// Alle gerade sichtbaren Dialoge.
function kpLineModals() {
  return Array.from(document.querySelectorAll('.modal.d-block, .modal.show'))
    .filter(m => m.offsetParent !== null || getComputedStyle(m).display !== 'none');
}

// Der Bestätigungsdialog („Are you sure you want to send your file to this chat?").
// Erkannt an den ✕-Knöpfen der einzelnen Bilder — die heißen in jeder Sprache
// gleich, die Überschrift nicht.
function kpLineSendDialog() {
  return kpLineModals().find(m => m.querySelector('.cmodal-item-remove')) || null;
}

// Wie viele Bilder hat LINE in den Dialog übernommen?
function kpLineDialogCount(dlg) {
  const d = dlg || kpLineSendDialog();
  return d ? d.querySelectorAll('.cmodal-item-remove').length : 0;
}

// Ein Dialog OHNE Bildzeilen ist eine Fehlermeldung — etwa „Sorry, you can only
// send up to 10 files at once." bei mehr als zehn Dateien.
function kpLineErrorModal() {
  return kpLineModals().find(m => !m.querySelector('.cmodal-item-remove')
                               && m.querySelector('button')) || null;
}
function kpLineModalText(m) {
  return m ? (m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

// Knöpfe im Dialog. `btn-primary` ist Senden bzw. OK, `btn-secondary` Abbrechen.
function kpLineDialogButton(m, kind) {
  if (!m) return null;
  const sel = kind === 'cancel' ? '.btn-secondary' : '.btn-primary';
  return m.querySelector('.modal-footer ' + sel) || m.querySelector(sel);
}

// Bildnachrichten im offenen Verlauf — der Beweis, dass etwas rausging.
function kpLineMediaCount() {
  return document.querySelectorAll('#chat-message-layout .chat-media-link').length;
}

// Name des offenen Chats, nur für die Rückfrage vor dem Versand.
function kpLineChatName() {
  const h = document.querySelector('.border-bottom h4.text-truncate, #content-secondary h4.text-truncate');
  return h ? (h.textContent || '').trim() : '';
}

// Ist überhaupt ein Chat offen? Ohne Datei-Feld gibt es nichts zu tun.
function kpLineChatOpen() {
  return !!kpLineFileInput();
}

// Das Eingabefeld steckt im Shadow-DOM von <textarea-ex id="editor">. Der Root
// ist offen, ein Content-Script kommt also heran. Wird für den Fotoversand
// nicht gebraucht, steht aber hier, damit das Wissen nicht verloren geht.
function kpLineComposer() {
  const host = document.getElementById('editor');
  if (!host) return null;
  return host.shadowRoot ? host.shadowRoot.querySelector('textarea.input') : null;
}
