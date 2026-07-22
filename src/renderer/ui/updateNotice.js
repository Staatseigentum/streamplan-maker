// electron-updater's GitHub provider reads releaseNotes from GitHub's own
// releases Atom feed, which reports the release body pre-rendered as HTML
// (not the raw markdown) — so this is already "<h3>Added</h3><ul>…" etc.,
// not something to run a markdown parser over. Safe to set as innerHTML
// directly: it originates from this repo's own CHANGELOG.md by way of the
// release workflow, not from user input.
import { t } from "../i18n/index.js";

function renderNotesInto(container, html) {
  const trimmed = (html || "").trim();
  container.innerHTML = trimmed || `<p class="update-notes-empty">${t("updateNotice.noDetails")}</p>`;
}

export class UpdateNotice {
  constructor(overlayEl) {
    this.overlayEl = overlayEl;
    this._build();
  }

  _build() {
    const modal = document.createElement("div");
    modal.id = "updateNoticeModal";

    const header = document.createElement("div");
    header.className = "settings-header";
    this.title = document.createElement("div");
    this.title.className = "settings-title";
    header.appendChild(this.title);
    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("updateNotice.hint");
    modal.appendChild(hint);

    this.notesEl = document.createElement("div");
    this.notesEl.className = "update-notes";
    modal.appendChild(this.notesEl);

    const btnRow = document.createElement("div");
    btnRow.className = "update-notice-actions";
    const laterBtn = document.createElement("button");
    laterBtn.textContent = t("common.later");
    laterBtn.addEventListener("click", () => this.close());
    const installBtn = document.createElement("button");
    installBtn.className = "primary";
    installBtn.textContent = t("common.restartInstall");
    installBtn.addEventListener("click", () => window.streamplanAPI.quitAndInstallUpdate());
    btnRow.append(laterBtn, installBtn);
    modal.appendChild(btnRow);

    this.overlayEl.appendChild(modal);
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });
  }

  show({ version, releaseNotes }) {
    this.title.textContent = t("updateNotice.title", { version });
    renderNotesInto(this.notesEl, releaseNotes);
    this.overlayEl.classList.add("open");
  }

  close() {
    this.overlayEl.classList.remove("open");
  }
}
