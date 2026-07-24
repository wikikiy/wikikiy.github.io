/**
 * 袋书 - 在线电子书阅读器
 * Main Application JavaScript
 * Features: EPUB/MOBI/AZW3/PDF/TXT, IndexedDB Bookshelf, Reading Progress
 */

(function () {
    'use strict';

    // ============================================
    // DOM References
    // ============================================
    const $ = (id) => document.getElementById(id);
    const qs = (sel, ctx) => (ctx || document).querySelector(sel);

    const dom = {
        homeArea: $('homeArea'),
        readerArea: $('readerArea'),
        fileInput: $('fileInput'),
        dropzone: $('dropzoneInline'),
        bookTitle: $('bookTitle'),
        tocList: $('tocList'),
        contentBody: $('contentBody'),
        contentWrapper: $('contentWrapper'),
        prevBtn: $('prevBtn'),
        nextBtn: $('nextBtn'),
        themeToggle: $('themeToggle'),
        ttsToggle: $('ttsToggle'),
        clearBtn: $('clearBtn'),
        toast: $('toast'),
        loadingOverlay: $('loadingOverlay'),
        loadingText: $('loadingText'),
        scrollTopBtn: $('scrollTopBtn'),
        bookshelfGrid: $('bookshelfGrid'),
        logoHome: $('logoHome'),
        backBtn: $('backBtn'),
        iconSun: qs('.icon-sun', $('themeToggle')),
        iconMoon: qs('.icon-moon', $('themeToggle')),
        iconPlay: qs('.icon-play', $('ttsToggle')),
        iconPause: qs('.icon-pause', $('ttsToggle')),
    };

    // ============================================
    // State
    // ============================================
    const state = {
        book: null,
        currentChapter: 0,
        chapters: [],
        isDark: false,
        ttsSynth: null,
        ttsUtterance: null,
        ttsChunks: [],
        ttsChunkIndex: 0,
        isTTSActive: false,
        currentBookId: null,
    };

    // ============================================
    // IndexedDB Database
    // ============================================
    const DB_NAME = 'DaishuDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'books';

    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('format', 'format', { unique: false });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveBookToDB(bookData) {
        try {
            const database = await openDB();
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(bookData);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('IndexedDB save error:', err);
        }
    }

    async function getAllBooksFromDB() {
        try {
            const database = await openDB();
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('IndexedDB read error:', err);
            return [];
        }
    }

    async function getBookFromDB(id) {
        try {
            const database = await openDB();
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(id);
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('IndexedDB get error:', err);
            return null;
        }
    }

    async function deleteBookFromDB(id) {
        try {
            const database = await openDB();
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('IndexedDB delete error:', err);
        }
    }

    async function updateBookProgress(id, currentChapter, totalChapters) {
        try {
            const book = await getBookFromDB(id);
            if (book) {
                book.currentChapter = currentChapter;
                book.totalChapters = totalChapters;
                book.progress = totalChapters > 0 ? Math.round((currentChapter / totalChapters) * 100) : 0;
                book.lastReadAt = Date.now();
                await saveBookToDB(book);
            }
        } catch (err) {
            console.warn('Update progress error:', err);
        }
    }

    // ============================================
    // Utility Functions
    // ============================================
    function showToast(message, duration = 3000) {
        dom.toast.textContent = message;
        dom.toast.classList.add('show');
        clearTimeout(dom.toast._timer);
        dom.toast._timer = setTimeout(() => {
            dom.toast.classList.remove('show');
        }, duration);
    }

    function showLoading(text = '加载中...') {
        dom.loadingText.textContent = text;
        dom.loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        dom.loadingOverlay.style.display = 'none';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function getFormatIcon(format) {
        const icons = { epub: '📘', mobi: '📙', azw3: '📕', pdf: '📄', txt: '📃' };
        return icons[format] || '📖';
    }

    // ============================================
    // Theme Management
    // ============================================
    function initTheme() {
        const saved = localStorage.getItem('daishu-theme');
        if (saved === 'dark') {
            state.isDark = true;
            document.documentElement.setAttribute('data-theme', 'dark');
            dom.iconSun.style.display = 'none';
            dom.iconMoon.style.display = 'block';
        } else {
            state.isDark = false;
            document.documentElement.removeAttribute('data-theme');
            dom.iconSun.style.display = 'block';
            dom.iconMoon.style.display = 'none';
        }
    }

    function toggleTheme() {
        state.isDark = !state.isDark;
        if (state.isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            dom.iconSun.style.display = 'none';
            dom.iconMoon.style.display = 'block';
            localStorage.setItem('daishu-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            dom.iconSun.style.display = 'block';
            dom.iconMoon.style.display = 'none';
            localStorage.setItem('daishu-theme', 'light');
        }
    }

    // ============================================
    // Bookshelf
    // ============================================
    async function renderBookshelf() {
        const books = await getAllBooksFromDB();
        dom.bookshelfGrid.innerHTML = '';

        if (!books || books.length === 0) {
            dom.bookshelfGrid.innerHTML = '<div class="bookshelf-empty">还没有添加书籍，上传你的第一本电子书吧 📚</div>';
            return;
        }

        // Sort by last read time
        books.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.dataset.id = book.id;

            const progress = book.progress || 0;

            card.innerHTML = `
                <div class="book-card-cover">
                    ${getFormatIcon(book.format)}
                    <span class="book-format-badge">${book.format.toUpperCase()}</span>
                    <button class="book-card-delete" data-id="${book.id}" title="删除书籍">✕</button>
                </div>
                <div class="book-card-info">
                    <div class="book-card-title">${escapeHtml(book.title)}</div>
                    <div class="book-card-progress">
                        <div class="book-card-progress-bar">
                            <div class="book-card-progress-fill" style="width:${progress}%"></div>
                        </div>
                        <span class="book-card-progress-text">${progress}%</span>
                    </div>
                </div>
            `;

            // Click to open book
            card.addEventListener('click', (e) => {
                if (e.target.closest('.book-card-delete')) return;
                openBookFromDB(book.id);
            });

            // Delete button
            const deleteBtn = card.querySelector('.book-card-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`确定要从书架中删除《${book.title}》吗？`)) {
                    await deleteBookFromDB(book.id);
                    renderBookshelf();
                    showToast(`已删除《${book.title}》`);
                }
            });

            dom.bookshelfGrid.appendChild(card);
        });
    }

    async function openBookFromDB(id) {
        showLoading('正在加载书籍...');
        try {
            const bookData = await getBookFromDB(id);
            if (!bookData) {
                showToast('书籍数据不存在');
                hideLoading();
                return;
            }

            // Restore chapters from stored data
            if (bookData.chapters && bookData.chapters.length > 0) {
                state.currentBookId = id;
                openBook(bookData.title, bookData.chapters, bookData.format);
                // Restore progress
                if (bookData.currentChapter !== undefined && bookData.currentChapter < bookData.chapters.length) {
                    goToChapter(bookData.currentChapter);
                }
                hideLoading();
            } else {
                // Need to re-parse from stored file content
                showToast('需要重新解析文件');
                hideLoading();
            }
        } catch (err) {
            console.error('Open book error:', err);
            showToast('打开书籍失败');
            hideLoading();
        }
    }

    // ============================================
    // File Upload
    // ============================================
    function handleFile(file) {
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        const supported = ['epub', 'txt', 'mobi', 'azw3', 'pdf'];

        if (supported.includes(ext)) {
            switch (ext) {
                case 'epub': loadEPUB(file); break;
                case 'txt': loadTXT(file); break;
                case 'mobi':
                case 'azw3': loadMOBI(file, ext); break;
                case 'pdf': loadPDF(file); break;
            }
        } else {
            showToast('不支持的文件格式，请上传 EPUB、MOBI、AZW3、PDF 或 TXT 文件');
        }
    }

    // ============================================
    // TXT Parser
    // ============================================
    function loadTXT(file) {
        showLoading('正在解析 TXT 文件...');
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const text = e.target.result;
                const chapters = parseTXTChapters(text);
                const title = file.name.replace(/\.txt$/i, '');
                saveAndOpenBook(title, chapters, 'txt', file);
            } catch (err) {
                console.error('TXT parse error:', err);
                showToast('解析 TXT 文件失败');
                hideLoading();
            }
        };
        reader.onerror = function () {
            showToast('读取文件失败');
            hideLoading();
        };
        reader.readAsText(file, 'utf-8');
    }

    function parseTXTChapters(text) {
        const chapterPatterns = [
            /^第[一二三四五六七八九十百千万零\d]+[章回节部集卷]\s*.*$/gm,
            /^第\d+[章回节部集卷]\s*.*$/gm,
            /^Chapter\s+\d+.*$/gim,
            /^CHAPTER\s+\d+.*$/gm,
            /^\d+\s*[、.．]\s*.*$/gm,
            /^[一二三四五六七八九十]+[、.．]\s*.*$/gm,
        ];

        let splitPoints = [];
        for (const pattern of chapterPatterns) {
            const matches = [];
            let match;
            while ((match = pattern.exec(text)) !== null) {
                matches.push({ index: match.index, text: match[0] });
            }
            if (matches.length > 1) {
                splitPoints = matches;
                break;
            }
        }

        let chapters;
        if (splitPoints.length > 1) {
            chapters = [];
            for (let i = 0; i < splitPoints.length; i++) {
                const start = splitPoints[i].index;
                const end = i < splitPoints.length - 1 ? splitPoints[i + 1].index : text.length;
                const chapterTitle = splitPoints[i].text.trim();
                const chapterContent = text.substring(start + splitPoints[i].text.length, end).trim();
                chapters.push({ title: chapterTitle, content: chapterContent || '(空)' });
            }
        } else {
            const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
            const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 20));
            chapters = [];
            for (let i = 0; i < paragraphs.length; i += chunkSize) {
                const chunk = paragraphs.slice(i, i + chunkSize);
                chapters.push({ title: `第 ${Math.floor(i / chunkSize) + 1} 节`, content: chunk.join('\n\n') });
            }
        }
        return chapters;
    }

    // ============================================
    // EPUB Parser
    // ============================================
    async function loadEPUB(file) {
        showLoading('正在解析 EPUB 文件...');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            const containerXmlStr = await zip.file('META-INF/container.xml').async('string');
            const containerParser = new DOMParser();
            const containerXml = containerParser.parseFromString(containerXmlStr, 'text/xml');
            const rootfileEl = containerXml.querySelector('rootfile');
            if (!rootfileEl) throw new Error('Invalid EPUB: no rootfile found');
            const opfPath = rootfileEl.getAttribute('full-path');

            const opfStr = await zip.file(opfPath).async('string');
            const opfParser = new DOMParser();
            const opfXml = opfParser.parseFromString(opfStr, 'text/xml');

            const titleEl = opfXml.querySelector('title') || opfXml.querySelector('dc\\:title');
            const bookTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/\.epub$/i, '');

            const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

            const manifest = {};
            opfXml.querySelectorAll('item').forEach(item => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                if (id && href) manifest[id] = { href, mediaType: item.getAttribute('media-type') };
            });

            const spine = [];
            opfXml.querySelectorAll('itemref').forEach(ref => {
                const idref = ref.getAttribute('idref');
                if (idref && manifest[idref]) spine.push(idref);
            });

            let tocItems = [];

            // EPUB 3 nav
            const navDocHref = opfXml.querySelector('[properties~="nav"]');
            if (navDocHref) {
                const navId = navDocHref.getAttribute('idref');
                if (navId && manifest[navId]) {
                    const navStr = await zip.file(opfDir + manifest[navId].href).async('string');
                    const navXml = new DOMParser().parseFromString(navStr, 'text/xml');
                    navXml.querySelectorAll('nav[epub\\:type="toc"] a, nav a').forEach(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();
                        if (href && text) tocItems.push({ href, text });
                    });
                }
            }

            // EPUB 2 NCX
            if (tocItems.length === 0) {
                const ncxEl = opfXml.querySelector('[media-type="application/x-dtbncx+xml"]');
                if (ncxEl) {
                    const ncxId = ncxEl.getAttribute('id');
                    if (ncxId && manifest[ncxId]) {
                        const ncxStr = await zip.file(opfDir + manifest[ncxId].href).async('string');
                        const ncxXml = new DOMParser().parseFromString(ncxStr, 'text/xml');
                        ncxXml.querySelectorAll('navPoint').forEach(np => {
                            const text = np.querySelector('text');
                            const content = np.querySelector('content');
                            if (text && content) tocItems.push({ text: text.textContent.trim(), href: content.getAttribute('src') });
                        });
                    }
                }
            }

            // Fallback: build from spine
            if (tocItems.length === 0) {
                spine.forEach(idref => {
                    const item = manifest[idref];
                    if (item) {
                        const fileName = item.href.split('/').pop().replace(/\.[^.]+$/, '');
                        tocItems.push({ text: fileName.replace(/[-_]/g, ' '), href: item.href });
                    }
                });
            }

            const chapters = [];
            for (const tocItem of tocItems) {
                try {
                    let href = tocItem.href;
                    const hashIndex = href.indexOf('#');
                    href = hashIndex >= 0 ? href.substring(0, hashIndex) : href;

                    const fullPath = opfDir + href;
                    let fileEntry = zip.file(fullPath);
                    if (!fileEntry) fileEntry = zip.file(href);
                    if (!fileEntry) continue;

                    const contentStr = await fileEntry.async('string');
                    const contentDoc = new DOMParser().parseFromString(contentStr, 'text/html');
                    const body = contentDoc.body || contentDoc.documentElement;
                    if (!body) continue;

                    const clone = body.cloneNode(true);
                    clone.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
                    let textContent = (clone.textContent || '').replace(/\s+/g, ' ').trim();
                    if (textContent.length < 10) continue;

                    chapters.push({ title: tocItem.text || `第 ${chapters.length + 1} 章`, content: textContent });
                } catch (err) {
                    console.warn('Failed to load chapter:', tocItem.text);
                }
            }

            if (chapters.length === 0) {
                showToast('无法解析此 EPUB 文件的内容');
                hideLoading();
                return;
            }

            saveAndOpenBook(bookTitle, chapters, 'epub', file);
        } catch (err) {
            console.error('EPUB parse error:', err);
            showToast('解析 EPUB 文件失败: ' + err.message);
            hideLoading();
        }
    }

    // ============================================
    // MOBI / AZW3 Parser (basic text extraction)
    // ============================================
    async function loadMOBI(file, format) {
        showLoading(`正在解析 ${format.toUpperCase()} 文件...`);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const text = extractMobiText(arrayBuffer);
            const title = file.name.replace(new RegExp('\\.' + format + '$', 'i'), '');

            if (text.length < 50) {
                showToast(`${format.toUpperCase()} 解析内容过少，可能为加密或图片类书籍`);
                hideLoading();
                return;
            }

            const chapters = parseTXTChapters(text);
            saveAndOpenBook(title, chapters, format, file);
        } catch (err) {
            console.error('MOBI parse error:', err);
            showToast(`解析 ${format.toUpperCase()} 文件失败`);
            hideLoading();
        }
    }

    function extractMobiText(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let text = '';

        // Try to find and extract the text content from MOBI/PalmDB format
        // MOBI header starts with "BOOKMOBI" or "TEXtREAd"
        const header = String.fromCharCode(...bytes.slice(0, 16));

        if (header.includes('BOOK') || header.includes('TEXt')) {
            // Try to extract readable text by scanning for UTF-8 sequences
            // This is a simplified extraction - real MOBI parsing is complex
            let inText = false;
            let currentText = '';
            let consecutiveText = 0;

            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                // Check for printable ASCII or common UTF-8 multi-byte sequences
                if ((b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09 ||
                    (b >= 0xC0 && b <= 0xDF) || (b >= 0xE0 && b <= 0xEF)) {
                    consecutiveText++;
                    if (consecutiveText > 3) {
                        currentText += String.fromCharCode(b);
                        inText = true;
                    }
                } else {
                    if (inText && currentText.length > 10) {
                        // Try to decode as UTF-8
                        try {
                            const decoder = new TextDecoder('utf-8', { fatal: false });
                            const decoded = decoder.decode(new Uint8Array(currentText.split('').map(c => c.charCodeAt(0))));
                            if (decoded.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').length > decoded.length * 0.3) {
                                text += decoded + '\n';
                            }
                        } catch (e) {}
                    }
                    currentText = '';
                    consecutiveText = 0;
                    inText = false;
                }
            }
        }

        // If extraction failed, try to find any readable text patterns
        if (text.length < 100) {
            text = '';
            let chunk = '';
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if ((b >= 0x20 && b <= 0x7E) || b >= 0xA0) {
                    chunk += String.fromCharCode(b);
                } else if (b === 0x0A || b === 0x0D) {
                    if (chunk.length > 5) {
                        text += chunk + '\n';
                    }
                    chunk = '';
                } else {
                    if (chunk.length > 5) {
                        text += chunk + ' ';
                    }
                    chunk = '';
                }
            }
            if (chunk.length > 5) text += chunk;
        }

        // Clean up
        text = text.replace(/[^\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\u0020-\u007e\u00a0-\u00ff\n]/g, ' ')
                   .replace(/\s+/g, ' ')
                   .replace(/\n\s*\n/g, '\n\n')
                   .trim();

        return text;
    }

    // ============================================
    // PDF Parser (using PDF.js)
    // ============================================
    async function loadPDF(file) {
        showLoading('正在解析 PDF 文件...');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdf.numPages;
            const title = file.name.replace(/\.pdf$/i, '');

            let fullText = '';
            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
                // Update loading progress
                dom.loadingText.textContent = `正在解析 PDF... ${i}/${totalPages} 页`;
            }

            if (fullText.trim().length < 50) {
                showToast('PDF 内容提取失败，可能为扫描件或图片类 PDF');
                hideLoading();
                return;
            }

            const chapters = parseTXTChapters(fullText);
            saveAndOpenBook(title, chapters, 'pdf', file);
        } catch (err) {
            console.error('PDF parse error:', err);
            showToast('解析 PDF 文件失败: ' + err.message);
            hideLoading();
        }
    }

    // ============================================
    // Save to IndexedDB & Open Book
    // ============================================
    async function saveAndOpenBook(title, chapters, format, file) {
        const id = generateId();

        // Save to IndexedDB
        const bookData = {
            id: id,
            title: title,
            format: format,
            chapters: chapters,
            currentChapter: 0,
            totalChapters: chapters.length,
            progress: 0,
            addedAt: Date.now(),
            lastReadAt: Date.now(),
            fileName: file.name,
            fileSize: file.size,
        };

        await saveBookToDB(bookData);
        state.currentBookId = id;

        openBook(title, chapters, format);
        renderBookshelf();
        hideLoading();
    }

    // ============================================
    // Book Management
    // ============================================
    function openBook(title, chapters, format) {
        state.book = { title, format };
        state.chapters = chapters;
        state.currentChapter = 0;

        dom.bookTitle.textContent = title;
        renderTOC();
        renderChapter(0);

        dom.homeArea.style.display = 'none';
        dom.readerArea.style.display = 'flex';

        dom.clearBtn.disabled = false;
        dom.ttsToggle.disabled = false;

        updateNavButtons();
        dom.contentWrapper.scrollTop = 0;

        showToast(`已加载《${title}》`);
    }

    function goHome() {
        stopTTS();
        state.book = null;
        state.chapters = [];
        state.currentChapter = 0;
        state.currentBookId = null;

        dom.bookTitle.textContent = '目录';
        dom.tocList.innerHTML = '';
        dom.contentBody.innerHTML = '';
        dom.homeArea.style.display = 'block';
        dom.readerArea.style.display = 'none';

        dom.clearBtn.disabled = true;
        dom.ttsToggle.disabled = true;
        dom.fileInput.value = '';

        renderBookshelf();
    }

    function clearBook() {
        if (state.currentBookId) {
            deleteBookFromDB(state.currentBookId);
        }
        goHome();
        showToast('已清除电子书');
    }

    // ============================================
    // TOC Rendering
    // ============================================
    function renderTOC() {
        dom.tocList.innerHTML = '';
        state.chapters.forEach((chapter, index) => {
            const item = document.createElement('div');
            item.className = 'toc-item' + (index === state.currentChapter ? ' active' : '');
            item.textContent = chapter.title;
            item.setAttribute('role', 'listitem');
            item.setAttribute('tabindex', '0');
            item.addEventListener('click', () => goToChapter(index));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToChapter(index);
                }
            });
            dom.tocList.appendChild(item);
        });
    }

    function updateTOCActive() {
        dom.tocList.querySelectorAll('.toc-item').forEach((item, index) => {
            item.classList.toggle('active', index === state.currentChapter);
        });
    }

    // ============================================
    // Chapter Rendering
    // ============================================
    function renderChapter(index) {
        if (!state.chapters[index]) return;

        state.currentChapter = index;
        const chapter = state.chapters[index];

        let content = chapter.content;
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
        if (paragraphs.length > 0 && !content.includes('<')) {
            content = paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
        } else if (content.includes('<')) {
            content = `${content}`;
        } else {
            content = `<p>${escapeHtml(content)}</p>`;
        }

        dom.contentBody.innerHTML = content;
        dom.contentWrapper.scrollTop = 0;

        updateTOCActive();
        updateNavButtons();
        updateScrollTopBtn();

        // Save progress
        if (state.currentBookId) {
            updateBookProgress(state.currentBookId, index, state.chapters.length);
        }
    }

    function goToChapter(index) {
        if (index < 0 || index >= state.chapters.length) return;
        if (state.isTTSActive) stopTTS();
        renderChapter(index);
    }

    // ============================================
    // Navigation
    // ============================================
    function updateNavButtons() {
        dom.prevBtn.disabled = state.currentChapter <= 0;
        dom.nextBtn.disabled = state.currentChapter >= state.chapters.length - 1;
    }

    function prevChapter() {
        if (state.currentChapter > 0) goToChapter(state.currentChapter - 1);
    }

    function nextChapter() {
        if (state.currentChapter < state.chapters.length - 1) goToChapter(state.currentChapter + 1);
    }

    // ============================================
    // Scroll to Top
    // ============================================
    function updateScrollTopBtn() {
        dom.scrollTopBtn.classList.toggle('visible', dom.contentWrapper.scrollTop > 300);
    }

    // ============================================
    // TTS (Text-to-Speech)
    // ============================================
    function initTTS() {
        state.ttsSynth = window.speechSynthesis;
        if (!state.ttsSynth) {
            dom.ttsToggle.disabled = true;
            dom.ttsToggle.title = '当前浏览器不支持语音合成';
        }
    }

    function getChapterTextNodes() {
        const walker = document.createTreeWalker(dom.contentBody, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim().length > 0) textNodes.push(node);
        }
        return textNodes;
    }

    function toggleTTS() {
        if (!state.ttsSynth) {
            showToast('当前浏览器不支持语音合成功能');
            return;
        }
        if (state.isTTSActive) pauseTTS();
        else startTTS();
    }

    function startTTS() {
        if (state.chapters.length === 0) return;
        const textNodes = getChapterTextNodes();
        if (textNodes.length === 0) {
            showToast('当前章节没有可朗读的文本');
            return;
        }

        state.isTTSActive = true;
        state.ttsChunks = textNodes;
        state.ttsChunkIndex = 0;

        dom.iconPlay.style.display = 'none';
        dom.iconPause.style.display = 'block';
        dom.ttsToggle.classList.add('is-playing');
        dom.ttsToggle.title = '暂停听书';

        speakNextChunk();
    }

    function speakNextChunk() {
        if (!state.isTTSActive || state.ttsChunkIndex >= state.ttsChunks.length) {
            if (state.ttsChunkIndex >= state.ttsChunks.length) {
                if (state.currentChapter < state.chapters.length - 1) {
                    nextChapter();
                    setTimeout(() => {
                        if (state.isTTSActive) {
                            const nodes = getChapterTextNodes();
                            if (nodes.length > 0) {
                                state.ttsChunks = nodes;
                                state.ttsChunkIndex = 0;
                                speakNextChunk();
                            } else stopTTS();
                        }
                    }, 500);
                } else {
                    stopTTS();
                    showToast('全书朗读完毕');
                }
            }
            return;
        }

        const node = state.ttsChunks[state.ttsChunkIndex];
        const text = node.textContent;

        clearTTSHighlights();
        const span = document.createElement('span');
        span.className = 'tts-highlight';
        node.parentNode.replaceChild(span, node);
        span.textContent = text;
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onend = () => { state.ttsChunkIndex++; speakNextChunk(); };
        utterance.onerror = () => { state.ttsChunkIndex++; speakNextChunk(); };

        state.ttsUtterance = utterance;
        state.ttsSynth.speak(utterance);
    }

    function pauseTTS() {
        if (state.ttsSynth && state.ttsSynth.speaking) state.ttsSynth.cancel();
        state.isTTSActive = false;
        dom.iconPlay.style.display = 'block';
        dom.iconPause.style.display = 'none';
        dom.ttsToggle.classList.remove('is-playing');
        dom.ttsToggle.title = '继续听书';
        clearTTSHighlights();
    }

    function stopTTS() {
        if (state.ttsSynth) state.ttsSynth.cancel();
        state.isTTSActive = false;
        state.ttsChunks = [];
        state.ttsChunkIndex = 0;
        dom.iconPlay.style.display = 'block';
        dom.iconPause.style.display = 'none';
        dom.ttsToggle.classList.remove('is-playing');
        dom.ttsToggle.title = '听书';
        clearTTSHighlights();
    }

    function clearTTSHighlights() {
        dom.contentBody.querySelectorAll('.tts-highlight').forEach(el => {
            const textNode = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(textNode, el);
        });
    }

    // ============================================
    // Event Handlers
    // ============================================
    function setupEventListeners() {
        // File input
        dom.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                // Handle multiple files
                Array.from(e.target.files).forEach(f => handleFile(f));
            }
        });

        // Drag and drop
        dom.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dom.dropzone.classList.add('drag-over');
        });

        dom.dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dom.dropzone.classList.remove('drag-over');
        });

        dom.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dom.dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                Array.from(e.dataTransfer.files).forEach(f => handleFile(f));
            }
        });

        dom.dropzone.addEventListener('click', () => dom.fileInput.click());

        // Navigation
        dom.prevBtn.addEventListener('click', prevChapter);
        dom.nextBtn.addEventListener('click', nextChapter);

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (dom.readerArea.style.display !== 'flex') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); prevChapter(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); nextChapter(); }
        });

        // Theme
        dom.themeToggle.addEventListener('click', toggleTheme);

        // TTS
        dom.ttsToggle.addEventListener('click', toggleTTS);

        // Clear
        dom.clearBtn.addEventListener('click', clearBook);

        // Logo home
        dom.logoHome.addEventListener('click', (e) => {
            e.preventDefault();
            if (dom.readerArea.style.display === 'flex') {
                goHome();
            }
        });

        // Back button in sidebar
        if (dom.backBtn) {
            dom.backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                goHome();
            });
        }

        // Scroll to top
        dom.scrollTopBtn.addEventListener('click', () => {
            dom.contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        });

        dom.contentWrapper.addEventListener('scroll', debounce(updateScrollTopBtn, 100));

        // Beforeunload
        window.addEventListener('beforeunload', () => {
            if (state.ttsSynth) state.ttsSynth.cancel();
        });
    }

    // ============================================
    // Initialization
    // ============================================
    async function init() {
        initTheme();
        initTTS();
        setupEventListeners();

        // Configure PDF.js
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // Load bookshelf
        await renderBookshelf();

        console.log('📖 袋书已加载');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();