// Renders the small subset of markdown used in CHANGELOG.md sections
// (### headings, "- " bullets, blank-line paragraphs) as safe DOM nodes —
// deliberately not innerHTML'ing raw text, since release notes ultimately
// originate from a file in the repo, not user input, but this keeps it cheap
// to reason about either way.
function renderNotesInto(container, markdown) {
  container.textContent = "";
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  let list = null;
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      return;
    }
    const heading = line.match(/^#{2,4}\s+(.*)$/);
    if (heading) {
      list = null;
      const h = document.createElement("div");
      h.className = "update-notes-heading";
      h.textContent = heading[1];
      container.appendChild(h);
      return;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = document.createElement("ul");
        list.className = "update-notes-list";
        container.appendChild(list);
      }
      const li = document.createElement("li");
      li.textContent = bullet[1];
      list.appendChild(li);
      return;
    }
    list = null;
    const p = document.createElement("div");
    p.className = "update-notes-para";
    p.textContent = line;
    container.appendChild(p);
  });
  if (!container.children.length) {
    const fallback = document.createElement("div");
    fallback.className = "update-notes-para";
    fallback.textContent = "No details were provided for this update.";
    container.appendChild(fallback);
  }
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
    hint.textContent = "This update has already downloaded in the background and is ready to install.";
    modal.appendChild(hint);

    this.notesEl = document.createElement("div");
    this.notesEl.className = "update-notes";
    modal.appendChild(this.notesEl);

    const btnRow = document.createElement("div");
    btnRow.className = "update-notice-actions";
    const laterBtn = document.createElement("button");
    laterBtn.textContent = "Later";
    laterBtn.addEventListener("click", () => this.close());
    const installBtn = document.createElement("button");
    installBtn.className = "primary";
    installBtn.textContent = "Restart && Install";
    installBtn.addEventListener("click", () => window.streamplanAPI.quitAndInstallUpdate());
    btnRow.append(laterBtn, installBtn);
    modal.appendChild(btnRow);

    this.overlayEl.appendChild(modal);
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });
  }

  show({ version, releaseNotes }) {
    this.title.textContent = `Update v${version} is ready to install`;
    renderNotesInto(this.notesEl, releaseNotes);
    this.overlayEl.classList.add("open");
  }

  close() {
    this.overlayEl.classList.remove("open");
  }
}
