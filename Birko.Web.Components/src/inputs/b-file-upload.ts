import { BaseComponent, define } from 'birko-web-core';
import { formFieldSheet } from '../shared-styles';

export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  progress: number;
  url?: string;
  error?: string;
  thumbnail?: string;
}

export interface UploadResult {
  fileId: string;
  success: boolean;
  url?: string;
  error?: string;
}

export class BFileUpload extends BaseComponent {
  static get observedAttributes() {
    return ['accept', 'multiple', 'max-size', 'max-files', 'disabled', 'label', 'endpoint',
            'label-drop', 'label-drop-more', 'label-drop-empty', 'label-max', 'label-pending',
            'label-error', 'label-too-large', 'label-upload-failed', 'label-network-error', 'label-remove'];
  }

  private _files: UploadFile[] = [];
  private _dragging = false;

  static get sharedStyles() {
    return [formFieldSheet];
  }

  static get styles() {
    return `
      :host { display: block; }
      .dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--b-space-xs, 0.25rem);
        padding: var(--b-space-xl, 1.5rem);
        border: 2px dashed var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        background: var(--b-bg-secondary);
        cursor: pointer;
        transition: border-color var(--b-transition, 150ms ease), background var(--b-transition, 150ms ease);
      }
      .dropzone.dragging {
        border-color: var(--b-color-primary);
        background: var(--b-color-primary-light);
      }
      .dropzone.disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
        pointer-events: none;
      }
      .dropzone.compact { padding: var(--b-space-md, 0.75rem); }
      .dz-icon { font-size: var(--b-icon-xl, 2.5rem); opacity: var(--b-muted-opacity, 0.4); }
      .dz-text { font-size: var(--b-text-sm, 0.8125rem); color: var(--b-text-secondary); }
      .dz-hint { font-size: var(--b-text-xs, 0.6875rem); color: var(--b-text-muted); }
      input[type="file"] { display: none; }

      .file-list {
        display: flex;
        flex-direction: column;
        gap: var(--b-space-xs, 0.25rem);
        margin-top: var(--b-space-sm, 0.5rem);
      }
      .file-row {
        display: flex;
        align-items: center;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        border: var(--b-border-width, 1px) solid var(--b-border);
        border-radius: var(--b-radius, 0.375rem);
        font-size: var(--b-text-sm, 0.8125rem);
      }
      .file-thumb {
        width: 3rem;
        height: 3rem;
        border-radius: var(--b-radius, 0.375rem);
        object-fit: cover;
        flex-shrink: 0;
      }
      .file-icon {
        width: 3rem;
        height: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--b-text-xl, 1.25rem);
        flex-shrink: 0;
      }
      .file-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--b-text);
      }
      .file-meta {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted);
      }
      .file-status { flex-shrink: 0; font-size: var(--b-text-xs, 0.6875rem); }
      .status-pending { color: var(--b-text-muted); }
      .status-complete { color: var(--b-color-success); }
      .status-error { color: var(--b-color-danger); }
      .progress-bar {
        width: 5rem;
        height: 0.375rem;
        background: var(--b-bg-tertiary);
        border-radius: var(--b-radius-full, 9999px);
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: var(--b-color-primary);
        border-radius: var(--b-radius-full, 9999px);
        transition: width var(--b-transition, 150ms ease);
      }
      .file-remove {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--b-text-muted);
        font-size: var(--b-icon-base, 1rem);
        line-height: 1;
        padding: var(--b-space-xs, 0.25rem);
        border-radius: var(--b-radius, 0.375rem);
        flex-shrink: 0;
      }
      .file-remove:hover { background: var(--b-bg-tertiary); color: var(--b-text); }
    `;
  }

  render() {
    const label = this.attr('label');
    const disabled = this.boolAttr('disabled');
    const accept = this.attr('accept', '*');
    const multiple = this.boolAttr('multiple');
    const maxSize = this.numAttr('max-size', 10485760);
    const hasFiles = this._files.length > 0;

    const lMax = this.attr('label-max', 'Max');
    const hint = `${lMax} ${this._formatSize(maxSize)}` +
      (accept !== '*' ? ` · ${accept}` : '');

    const lDrop = this.attr('label-drop', 'Drop to upload');
    const lDropMore = this.attr('label-drop-more', 'Drop more files or click to browse');
    const lDropEmpty = this.attr('label-drop-empty', 'Drop files here or click to browse');

    return `
      <div class="field">
        ${label ? `<label>${label}</label>` : ''}
        <div class="dropzone ${this._dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${hasFiles ? 'compact' : ''}">
          <input type="file"
                 ${accept !== '*' ? `accept="${accept}"` : ''}
                 ${multiple ? 'multiple' : ''}
                 ${disabled ? 'disabled' : ''} />
          ${this._dragging
            ? `<span class="dz-text">${lDrop}</span>`
            : hasFiles
              ? `<span class="dz-text">${lDropMore}</span>`
              : `<span class="dz-icon">&#128193;</span>
                 <span class="dz-text">${lDropEmpty}</span>
                 <span class="dz-hint">${hint}</span>`
          }
        </div>
        ${hasFiles ? `<div class="file-list">${this._files.map(f => this._renderFile(f)).join('')}</div>` : ''}
      </div>
    `;
  }

  private _renderFile(f: UploadFile): string {
    const icon = f.thumbnail
      ? `<img class="file-thumb" src="${f.thumbnail}" alt="" />`
      : `<span class="file-icon">${this._fileIcon(f.type)}</span>`;

    let status: string;
    if (f.status === 'uploading') {
      status = `<div class="progress-bar"><div class="progress-fill" style="width:${f.progress}%"></div></div>
                <span class="file-status">${f.progress}%</span>`;
    } else if (f.status === 'complete') {
      status = '<span class="file-status status-complete">&#10003;</span>';
    } else if (f.status === 'error') {
      status = `<span class="file-status status-error">${f.error ?? this.attr('label-error', 'Error')}</span>`;
    } else {
      status = `<span class="file-status status-pending">${this.attr('label-pending', 'Pending')}</span>`;
    }

    return `
      <div class="file-row" data-id="${f.id}">
        ${icon}
        <div class="file-info">
          <span class="file-name">${f.name}</span>
          <span class="file-meta">${this._formatSize(f.size)}</span>
        </div>
        ${status}
        <button class="file-remove" data-id="${f.id}" type="button" aria-label="${this.attr('label-remove', 'Remove')} ${f.name}">&times;</button>
      </div>
    `;
  }

  protected onUpdated() {
    const dropzone = this.$<HTMLElement>('.dropzone');
    const input = this.$<HTMLInputElement>('input[type="file"]');
    if (!dropzone || !input) return;

    // Click to browse
    this.listen(dropzone, 'click', () => input.click());

    // File input change
    this.listen(input, 'change', () => {
      if (input.files?.length) {
        this._addFiles(Array.from(input.files));
        input.value = '';  // reset so same file can be re-selected
      }
    });

    // Drag and drop
    this.listen(dropzone, 'dragover', (e: Event) => {
      e.preventDefault();
      this._dragging = true;
      this.update();
    });
    this.listen(dropzone, 'dragleave', () => {
      this._dragging = false;
      this.update();
    });
    this.listen(dropzone, 'drop', (e: Event) => {
      e.preventDefault();
      this._dragging = false;
      if ((e as DragEvent).dataTransfer?.files.length) {
        this._addFiles(Array.from((e as DragEvent).dataTransfer!.files));
      }
    });

    // Remove buttons
    this.$$<HTMLElement>('.file-remove').forEach(btn => {
      this.listen(btn, 'click', (e: Event) => {
        e.stopPropagation();
        this.removeFile(btn.dataset.id!);
      });
    });
  }

  private async _addFiles(files: File[]) {
    const maxSize = this.numAttr('max-size', 10485760);
    const maxFiles = this.numAttr('max-files', 10);
    const multiple = this.boolAttr('multiple');

    if (!multiple) {
      files = files.slice(0, 1);
      this._files = [];
    }

    const remaining = maxFiles - this._files.length;
    files = files.slice(0, remaining);

    const newFiles: UploadFile[] = [];
    for (const file of files) {
      const uf: UploadFile = {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: file.size > maxSize ? 'error' : 'pending',
        progress: 0,
        error: file.size > maxSize ? (this.attr('label-too-large', 'File too large')) : undefined,
      };

      // Generate thumbnail for images
      if (file.type.startsWith('image/') && file.size <= maxSize) {
        uf.thumbnail = await this._generateThumbnail(file);
      }

      newFiles.push(uf);
    }

    this._files.push(...newFiles);
    this.update();
    this.emit('files-added', { files: newFiles });

    // Auto-upload if endpoint is set
    const endpoint = this.attr('endpoint');
    if (endpoint) {
      const pending = newFiles.filter(f => f.status === 'pending');
      for (const f of pending) {
        this._uploadFile(f, endpoint);
      }
    }
  }

  private _uploadFile(file: UploadFile, endpoint: string) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file.file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        file.progress = Math.round((e.loaded / e.total) * 100);
        file.status = 'uploading';
        this.emit('upload-progress', { fileId: file.id, progress: file.progress });
        this.update();
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          file.status = 'complete';
          file.url = data.url;
          this.emit('upload-complete', { fileId: file.id, url: data.url });
        } catch {
          file.status = 'complete';
          this.emit('upload-complete', { fileId: file.id });
        }
      } else {
        file.status = 'error';
        file.error = `${this.attr('label-upload-failed', 'Upload failed')} (${xhr.status})`;
        this.emit('upload-error', { fileId: file.id, error: file.error });
      }
      this.update();
      this._checkAllComplete();
    });

    xhr.addEventListener('error', () => {
      file.status = 'error';
      file.error = this.attr('label-network-error', 'Network error');
      this.emit('upload-error', { fileId: file.id, error: file.error });
      this.update();
      this._checkAllComplete();
    });

    xhr.open('POST', endpoint);
    xhr.send(formData);
  }

  private _checkAllComplete() {
    const allDone = this._files.every(f => f.status === 'complete' || f.status === 'error');
    if (allDone) {
      this.emit('all-complete', {
        results: this._files.map(f => ({
          fileId: f.id,
          success: f.status === 'complete',
          url: f.url,
          error: f.error,
        })),
      });
    }
  }

  private _generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  private _fileIcon(type: string): string {
    if (type.startsWith('image/')) return '&#128247;';
    if (type.startsWith('video/')) return '&#127909;';
    if (type.startsWith('audio/')) return '&#127925;';
    if (type.includes('pdf')) return '&#128196;';
    if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return '&#128230;';
    return '&#128196;';
  }

  private _formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  // ── Public API ──

  getFiles(): UploadFile[] {
    return [...this._files];
  }

  async upload(): Promise<UploadResult[]> {
    const endpoint = this.attr('endpoint');
    if (!endpoint) return [];

    const pending = this._files.filter(f => f.status === 'pending');
    const promises = pending.map(f =>
      new Promise<UploadResult>((resolve) => {
        const origEmit = this.emit.bind(this);
        const check = (e: CustomEvent) => {
          const d = e.detail;
          if (d.fileId === f.id) {
            this.removeEventListener('upload-complete', check as EventListener);
            this.removeEventListener('upload-error', check as EventListener);
            resolve({ fileId: f.id, success: f.status === 'complete', url: f.url, error: f.error });
          }
        };
        this.addEventListener('upload-complete', check as EventListener);
        this.addEventListener('upload-error', check as EventListener);
        this._uploadFile(f, endpoint);
      })
    );
    return Promise.all(promises);
  }

  clear() {
    this._files = [];
    this.update();
  }

  removeFile(id: string) {
    this._files = this._files.filter(f => f.id !== id);
    this.update();
    this.emit('file-removed', { fileId: id });
  }
}

define('b-file-upload', BFileUpload);
