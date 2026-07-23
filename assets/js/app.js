/**
 * 袋书 - 在线电子书阅读器
 * Main Application JavaScript
 */

(function () {
    'use strict';

    // ============================================
    // DOM References
    // ============================================
    const $ = (id) => document.getElementById(id);
    const $$ = (sel) => document.querySelectorAll(sel);
    const qs = (sel, ctx) => (ctx || document).querySelector(sel);

    const dom = {
        uploadArea: $('uploadArea'),
        readerArea: $('readerArea'),
        fileInput: $('fileInput'),
        dropzone: $('dropzone'),
        bookTitle: $('bookTitle'),
        tocList: $('tocList'),
        contentBody: $('contentBody'),
        contentScroll: $('contentScroll'),
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
        iconSun: qs('.icon-sun', $('themeToggle')),
        iconMoon: qs('.icon-moon', $('themeToggle')),
        iconPlay: qs('.icon-play', $('ttsToggle')),
        iconPause: qs('.icon-pause', $('ttsToggle')),
    };

    // ============================================
    // State
    // ============================================
    const state = {
        book: null,           // { title, chapters: [{title, content}], currentChapter }
        currentChapter: 0,
        chapters: [],
        isDark: false,
        isTTSPlaying: false,
        ttsSynth: null,
        ttsUtterance: null,
        ttsCurrentChar: 0,
        ttsChunks: [],
        ttsChunkIndex: 0,
        isTTSActive: false,
    };

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
    // File Upload
    // ============================================
    function handleFile(file) {
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'epub') {
            loadEPUB(file);
        } else if (ext === 'txt') {
            loadTXT(file);
        } else {
            showToast('不支持的文件格式，请上传 EPUB 或 TXT 文件');
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
                parseTXTContent(text, file.name.replace(/\.txt$/i, ''));
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

    function parseTXTContent(text, title) {
        // Try to detect chapters by common patterns
        const chapterPatterns = [
            /^第[一二三四五六七八九十百千万零\d]+[章回节部集卷]\s*.*$/gm,
            /^第\d+[章回节部集卷]\s*.*$/gm,
            /^Chapter\s+\d+.*$/gim,
            /^CHAPTER\s+\d+.*$/gm,
            /^\d+\s*[、.．]\s*.*$/gm,
            /^[一二三四五六七八九十]+[、.．]\s*.*$/gm,
        ];

        let splitPoints = [];
        let matchedPattern = null;

        for (const pattern of chapterPatterns) {
            const matches = [];
            let match;
            while ((match = pattern.exec(text)) !== null) {
                matches.push({ index: match.index, text: match[0] });
            }
            if (matches.length > 1) {
                splitPoints = matches;
                matchedPattern = pattern;
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
                chapters.push({
                    title: chapterTitle,
                    content: chapterContent || '(空)'
                });
            }
        } else {
            // No chapters found, split by paragraphs
            const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
            const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 20));
            chapters = [];
            for (let i = 0; i < paragraphs.length; i += chunkSize) {
                const chunk = paragraphs.slice(i, i + chunkSize);
                chapters.push({
                    title: `第 ${Math.floor(i / chunkSize) + 1} 节`,
                    content: chunk.join('\n\n')
                });
            }
        }

        openBook(title, chapters);
        hideLoading();
    }

    // ============================================
    // EPUB Parser
    // ============================================
    async function loadEPUB(file) {
        showLoading('正在解析 EPUB 文件...');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Find container.xml
            const containerXmlStr = await zip.file('META-INF/container.xml').async('string');
            const containerParser = new DOMParser();
            const containerXml = containerParser.parseFromString(containerXmlStr, 'text/xml');
            const rootfileEl = containerXml.querySelector('rootfile');
            if (!rootfileEl) throw new Error('Invalid EPUB: no rootfile found');
            const opfPath = rootfileEl.getAttribute('full-path');

            // Parse OPF
            const opfStr = await zip.file(opfPath).async('string');
            const opfParser = new DOMParser();
            const opfXml = opfParser.parseFromString(opfStr, 'text/xml');

            // Get book title
            const titleEl = opfXml.querySelector('title') || opfXml.querySelector('dc\\:title');
            const bookTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/\.epub$/i, '');

            // Get base path for OPF
            const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

            // Parse manifest
            const manifest = {};
            const items = opfXml.querySelectorAll('item');
            items.forEach(item => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                const mediaType = item.getAttribute('media-type');
                if (id && href) {
                    manifest[id] = { href, mediaType };
                }
            });

            // Parse spine (reading order)
            const spine = [];
            const itemrefs = opfXml.querySelectorAll('itemref');
            itemrefs.forEach(ref => {
                const idref = ref.getAttribute('idref');
                if (idref && manifest[idref]) {
                    spine.push(idref);
                }
            });

            // Also try to get TOC from nav (EPUB 3) or NCX (EPUB 2)
            let tocItems = [];

            // Try EPUB 3 nav first
            const navDocHref = opfXml.querySelector('[properties~="nav"]');
            if (navDocHref) {
                const navId = navDocHref.getAttribute('idref');
                if (navId && manifest[navId]) {
                    const navHref = manifest[navId].href;
                    const navPath = opfDir + navHref;
                    const navStr = await zip.file(navPath).async('string');
                    const navParser = new DOMParser();
                    const navXml = navParser.parseFromString(navStr, 'text/xml');
                    const navLinks = navXml.querySelectorAll('nav[epub\\:type="toc"] a, nav[epub\\:type="toc"] li a, nav a');
                    navLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();
                        if (href && text) {
                            tocItems.push({ href, text });
                        }
                    });
                }
            }

            // Try NCX (EPUB 2)
            if (tocItems.length === 0) {
                const ncxHref = opfXml.querySelector('spine') ? null : null;
                const ncxId = opfXml.querySelector('[media-type="application/x-dtbncx+xml"]');
                if (ncxId) {
                    const ncxIdVal = ncxId.getAttribute('id');
                    if (ncxIdVal && manifest[ncxIdVal]) {
                        const ncxPath = opfDir + manifest[ncxIdVal].href;
                        const ncxStr = await zip.file(ncxPath).async('string');
                        const ncxParser = new DOMParser();
                        const ncxXml = ncxParser.parseFromString(ncxStr, 'text/xml');
                        const navPoints = ncxXml.querySelectorAll('navPoint');
                        navPoints.forEach(np => {
                            const text = np.querySelector('text');
                            const content = np.querySelector('content');
                            if (text && content) {
                                tocItems.push({
                                    text: text.textContent.trim(),
                                    href: content.getAttribute('src')
                                });
                            }
                        });
                    }
                }
            }

            // If no TOC found, build from spine
            if (tocItems.length === 0) {
                for (const idref of spine) {
                    const item = manifest[idref];
                    if (item) {
                        const href = item.href;
                        const fileName = href.split('/').pop().replace(/\.[^.]+$/, '');
                        tocItems.push({
                            text: fileName.replace(/[-_]/g, ' '),
                            href: href
                        });
                    }
                }
            }

            // Load content for each TOC item
            const chapters = [];
            for (const tocItem of tocItems) {
                try {
                    // Resolve href relative to OPF directory
                    let href = tocItem.href;
                    // Handle fragment identifiers
                    const hashIndex = href.indexOf('#');
                    const fragment = hashIndex >= 0 ? href.substring(hashIndex) : '';
                    href = hashIndex >= 0 ? href.substring(0, hashIndex) : href;

                    const fullPath = opfDir + href;
                    const fileEntry = zip.file(fullPath);
                    let contentStr;
                    if (!fileEntry) {
                        // Try without opfDir
                        const altEntry = zip.file(href);
                        if (!altEntry) continue;
                        contentStr = await altEntry.async('string');
                    } else {
                        contentStr = await fileEntry.async('string');
                    }

                    // Parse HTML content
                    const contentParser = new DOMParser();
                    const contentDoc = contentParser.parseFromString(contentStr, 'text/html');

                    // Get text content, removing scripts, styles
                    const body = contentDoc.body || contentDoc.documentElement;
                    if (!body) continue;

                    // Clone to avoid modifying original
                    const clone = body.cloneNode(true);
                    // Remove unwanted elements
                    clone.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());

                    // Extract text
                    let textContent = clone.textContent || '';
                    textContent = textContent.replace(/\s+/g, ' ').trim();

                    if (textContent.length < 10) continue;

                    chapters.push({
                        title: tocItem.text || `第 ${chapters.length + 1} 章`,
                        content: textContent,
                        fragment: fragment
                    });
                } catch (err) {
                    console.warn('Failed to load chapter:', tocItem.text, err);
                }
            }

            if (chapters.length === 0) {
                // Fallback: try to load all spine items
                for (const idref of spine) {
                    const item = manifest[idref];
                    if (!item) continue;
                    try {
                        const fullPath = opfDir + item.href;
                        const fileEntry = zip.file(fullPath);
                        if (!fileEntry) continue;
                        const contentStr = await fileEntry.async('string');
                        const contentParser = new DOMParser();
                        const contentDoc = contentParser.parseFromString(contentStr, 'text/html');
                        const body = contentDoc.body || contentDoc.documentElement;
                        if (!body) continue;
                        const clone = body.cloneNode(true);
                        clone.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
                        let textContent = clone.textContent || '';
                        textContent = textContent.replace(/\s+/g, ' ').trim();
                        if (textContent.length < 10) continue;
                        const fileName = item.href.split('/').pop().replace(/\.[^.]+$/, '');
                        chapters.push({
                            title: fileName.replace(/[-_]/g, ' '),
                            content: textContent
                        });
                    } catch (err) {
                        console.warn('Failed to load spine item:', idref, err);
                    }
                }
            }

            if (chapters.length === 0) {
                showToast('无法解析此 EPUB 文件的内容');
                hideLoading();
                return;
            }

            openBook(bookTitle, chapters);
            hideLoading();
        } catch (err) {
            console.error('EPUB parse error:', err);
            showToast('解析 EPUB 文件失败: ' + err.message);
            hideLoading();
        }
    }

    // ============================================
    // Book Management
    // ============================================
    function openBook(title, chapters) {
        state.book = { title };
        state.chapters = chapters;
        state.currentChapter = 0;

        // Update UI
        dom.bookTitle.textContent = title;
        renderTOC();
        renderChapter(0);

        // Show reader, hide upload
        dom.uploadArea.style.display = 'none';
        dom.readerArea.style.display = 'flex';

        // Enable buttons
        dom.clearBtn.disabled = false;
        dom.ttsToggle.disabled = false;

        // Update navigation
        updateNavButtons();

        // Scroll to top
        dom.contentWrapper.scrollTop = 0;

        showToast(`已加载《${title}》`);
    }

    function clearBook() {
        // Stop TTS if playing
        stopTTS();

        state.book = null;
        state.chapters = [];
        state.currentChapter = 0;

        // Reset UI
        dom.bookTitle.textContent = '目录';
        dom.tocList.innerHTML = '';
        dom.contentBody.innerHTML = '';
        dom.uploadArea.style.display = 'flex';
        dom.readerArea.style.display = 'none';

        // Disable buttons
        dom.clearBtn.disabled = true;
        dom.ttsToggle.disabled = true;

        // Reset file input
        dom.fileInput.value = '';

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
        const items = dom.tocList.querySelectorAll('.toc-item');
        items.forEach((item, index) => {
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

        // Format content
        let content = chapter.content;
        // Convert plain text to HTML paragraphs
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
        if (paragraphs.length > 0 && !content.includes('<')) {
            content = paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
        } else if (content.includes('<')) {
            // Already has HTML
            content = `${content}`;
        } else {
            // Single block of text
            content = `<p>${escapeHtml(content)}</p>`;
        }

        dom.contentBody.innerHTML = content;
        dom.contentWrapper.scrollTop = 0;

        updateTOCActive();
        updateNavButtons();
        updateScrollTopBtn();
    }

    function goToChapter(index) {
        if (index < 0 || index >= state.chapters.length) return;
        // Stop TTS if playing
        if (state.isTTSActive) {
            stopTTS();
        }
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
        if (state.currentChapter > 0) {
            goToChapter(state.currentChapter - 1);
        }
    }

    function nextChapter() {
        if (state.currentChapter < state.chapters.length - 1) {
            goToChapter(state.currentChapter + 1);
        }
    }

    // ============================================
    // Scroll to Top
    // ============================================
    function updateScrollTopBtn() {
        const scrollTop = dom.contentWrapper.scrollTop;
        dom.scrollTopBtn.classList.toggle('visible', scrollTop > 300);
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
        // Get all text content from current chapter
        const body = dom.contentBody;
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent.trim();
            if (text.length > 0) {
                textNodes.push(node);
            }
        }
        return textNodes;
    }

    function toggleTTS() {
        if (!state.ttsSynth) {
            showToast('当前浏览器不支持语音合成功能');
            return;
        }

        if (state.isTTSActive) {
            pauseTTS();
        } else {
            startTTS();
        }
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
        state.ttsCurrentChar = 0;

        // Update UI
        dom.iconPlay.style.display = 'none';
        dom.iconPause.style.display = 'block';
        dom.ttsToggle.classList.add('is-playing');
        dom.ttsToggle.title = '暂停听书';

        speakNextChunk();
    }

    function speakNextChunk() {
        if (!state.isTTSActive || state.ttsChunkIndex >= state.ttsChunks.length) {
            // Finished all chunks
            if (state.ttsChunkIndex >= state.ttsChunks.length) {
                // Move to next chapter
                if (state.currentChapter < state.chapters.length - 1) {
                    nextChapter();
                    // Restart TTS for next chapter
                    setTimeout(() => {
                        if (state.isTTSActive) {
                            const textNodes = getChapterTextNodes();
                            if (textNodes.length > 0) {
                                state.ttsChunks = textNodes;
                                state.ttsChunkIndex = 0;
                                state.ttsCurrentChar = 0;
                                speakNextChunk();
                            } else {
                                stopTTS();
                            }
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

        // Highlight current text node
        clearTTSHighlights();
        const span = document.createElement('span');
        span.className = 'tts-highlight';
        node.parentNode.replaceChild(span, node);
        span.textContent = text;

        // Scroll to highlighted element
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => {
            state.ttsChunkIndex++;
            speakNextChunk();
        };

        utterance.onerror = (e) => {
            console.warn('TTS error:', e);
            state.ttsChunkIndex++;
            speakNextChunk();
        };

        state.ttsUtterance = utterance;
        state.ttsSynth.speak(utterance);
    }

    function pauseTTS() {
        if (state.ttsSynth && state.ttsSynth.speaking) {
            state.ttsSynth.cancel();
        }
        state.isTTSActive = false;
        dom.iconPlay.style.display = 'block';
        dom.iconPause.style.display = 'none';
        dom.ttsToggle.classList.remove('is-playing');
        dom.ttsToggle.title = '继续听书';
        clearTTSHighlights();
    }

    function stopTTS() {
        if (state.ttsSynth) {
            state.ttsSynth.cancel();
        }
        state.isTTSActive = false;
        state.ttsChunks = [];
        state.ttsChunkIndex = 0;
        state.ttsCurrentChar = 0;
        dom.iconPlay.style.display = 'block';
        dom.iconPause.style.display = 'none';
        dom.ttsToggle.classList.remove('is-playing');
        dom.ttsToggle.title = '听书';
        clearTTSHighlights();
    }

    function clearTTSHighlights() {
        dom.contentBody.querySelectorAll('.tts-highlight').forEach(el => {
            const text = el.textContent;
            const textNode = document.createTextNode(text);
            el.parentNode.replaceChild(textNode, el);
        });
    }

    // ============================================
    // Event Handlers
    // ============================================
    function setupEventListeners() {
        // File input change
        dom.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
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
                handleFile(e.dataTransfer.files[0]);
            }
        });

        // Click on dropzone label triggers file input
        dom.dropzone.addEventListener('click', () => {
            dom.fileInput.click();
        });

        // Navigation buttons
        dom.prevBtn.addEventListener('click', prevChapter);
        dom.nextBtn.addEventListener('click', nextChapter);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Only when reader is visible
            if (dom.readerArea.style.display !== 'flex') return;

            // Don't navigate if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevChapter();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextChapter();
            }
        });

        // Theme toggle
        dom.themeToggle.addEventListener('click', toggleTheme);

        // TTS toggle
        dom.ttsToggle.addEventListener('click', toggleTTS);

        // Clear button
        dom.clearBtn.addEventListener('click', clearBook);

        // Scroll to top
        dom.scrollTopBtn.addEventListener('click', () => {
            dom.contentWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Scroll event for scroll-to-top button
        dom.contentWrapper.addEventListener('scroll', debounce(updateScrollTopBtn, 100));

        // Handle page visibility for TTS
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && state.isTTSActive) {
                // Optionally pause when tab is hidden
                // pauseTTS();
            }
        });

        // Handle beforeunload to cancel TTS
        window.addEventListener('beforeunload', () => {
            if (state.ttsSynth) {
                state.ttsSynth.cancel();
            }
        });
    }

    // ============================================
    // Initialization
    // ============================================
    function init() {
        initTheme();
        initTTS();
        setupEventListeners();

        // Check for URL params (for future use)
        console.log('📖 袋书已加载');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();