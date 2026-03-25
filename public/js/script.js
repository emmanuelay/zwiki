document.addEventListener('DOMContentLoaded', onLoad);

// Flat index of all nodes for wiki-link resolution
let nodeIndex = [];
let currentContent = "";
let savedContent = "";
let currentPath = "";
let currentMeta = null;
let editing = false;
let allTags = [];
let tagsModified = false;
let savedMeta = null;

let searchDebounceTimer = null;
let searchActiveIndex = -1;
let lastSearchResults = [];
let lastSearchFacets = {};
let activeSearchFilters = new Set();
let lastSaveTime = 0;
let sseRefreshTimer = null;

function onLoad(event) {
	document.getElementById("btn-edit").addEventListener("click", toggleEditor);
	document.getElementById("btn-save").addEventListener("click", saveNode);
	document.getElementById("editor").addEventListener("input", onEditorInput);
	document.getElementById("btn-darkmode").addEventListener("click", toggleDarkMode);
	document.getElementById("btn-frontmatter").addEventListener("click", toggleFrontmatter);
	document.getElementById("btn-add-field").addEventListener("click", () => addFrontmatterRow("", ""));
	initResizeHandle();
	initSearch();

	document.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "s") {
			e.preventDefault();
			const btnSave = document.getElementById("btn-save");
			if (!btnSave.classList.contains("hidden") && !btnSave.disabled) {
				saveNode();
			}
		}
	});

	// Restore dark mode preference (system default unless overridden)
	applyDarkMode();
	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		if (localStorage.getItem("darkMode") === null) applyDarkMode();
	});

	fetchAllTags();
	fetchTree()
		.then(tree => {
			nodeIndex = flattenNodes(tree);
			setupWikiLinks();
			renderTree(tree);
			const lastPath = localStorage.getItem("currentNode");
			const hasLastNode = lastPath && nodeIndex.some(n => n.path === lastPath);
			if (hasLastNode) {
				loadNode(lastPath);
			} else if (tree.nodes && tree.nodes.length > 0) {
				loadNode(tree.nodes[0].path);
			}
		})
		.catch(error => {
			console.log("fetch failed", error)
		});

	connectSSE();
}

function onEditorInput() {
	const editor = document.getElementById("editor");
	const hasChanges = editor.value !== savedContent || getFrontmatterChanged();
	document.getElementById("btn-save").disabled = !hasChanges;
	document.getElementById("btn-edit").innerText = hasChanges ? "Cancel" : "View";
	styleEditButton(hasChanges ? "cancel" : "view");
	updateOutline(editor.value);
}

function toggleEditor() {
	const viewer = document.getElementById("viewer");
	const editorWrapper = document.getElementById("editor-wrapper");
	const editor = document.getElementById("editor");
	const btnEdit = document.getElementById("btn-edit");
	const btnSave = document.getElementById("btn-save");

	editing = !editing;

	if (editing) {
		editor.value = currentContent;
		loadFrontmatterEditor();
		viewer.classList.add("hidden");
		editorWrapper.classList.remove("hidden");
		btnSave.classList.remove("hidden");
		btnSave.disabled = true;
		btnEdit.innerText = "View";
		styleEditButton("view");
		editor.focus();
	} else {
		currentContent = savedContent;
		viewer.innerHTML = "";
		renderTags(viewer, currentMeta);
		const article = document.createElement("div");
		article.innerHTML = marked.parse(currentContent);
		viewer.appendChild(article);
		hljs.highlightAll();
		attachLinkHandlers();
		updateOutline(currentContent);
		editorWrapper.classList.add("hidden");
		resetFrontmatterPanel();
		btnSave.classList.add("hidden");
		viewer.classList.remove("hidden");
		btnEdit.innerText = "Edit";
		styleEditButton("edit");
	}
}

async function saveNode() {
	let content, meta;

	if (editing) {
		const editor = document.getElementById("editor");
		content = editor.value;
		meta = collectFrontmatter();
	} else {
		content = currentContent;
		meta = currentMeta || {};
	}

	const response = await fetch('/api/update?node=' + encodeURIComponent(currentPath), {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content: content, meta: meta })
	});

	if (!response.ok) {
		console.log("save failed", response.status);
		return;
	}

	savedContent = content;
	currentContent = content;
	currentMeta = Object.keys(meta).length > 0 ? meta : null;
	savedMeta = currentMeta ? { ...currentMeta } : null;
	tagsModified = false;

	if (editing) {
		editing = true;
		toggleEditor();
	} else {
		document.getElementById("btn-save").classList.add("hidden");
	}

	lastSaveTime = Date.now();
	fetchAllTags();
	refreshTree();
}

async function fetchTree() {
	const response = await fetch('/api/all');
	if (!response.ok) {
		const message = `An error has occured: ${response.status}`;
		throw new Error(message);
	}

	const tree = await response.json();
	return tree;
}

// Recursively collect all nodes from the folder tree
function flattenNodes(folder) {
	let result = [];
	if (folder.nodes != null) {
		for (const node of folder.nodes) {
			result.push(node);
		}
	}
	if (folder.folders != null) {
		for (const sub of folder.folders) {
			result = result.concat(flattenNodes(sub));
		}
	}
	return result;
}

// Resolve a wiki-link name to a node path
function resolveWikiLink(name) {
	const lower = name.toLowerCase();
	for (const node of nodeIndex) {
		if (node.title.toLowerCase() === lower) {
			return node.path;
		}
	}
	// Try matching filename without extension
	for (const node of nodeIndex) {
		const filename = node.path.split("/").pop().replace(/\.md$/, "");
		if (filename.toLowerCase() === lower) {
			return node.path;
		}
	}
	return null;
}

// Register a marked extension for [[wiki-links]]
function setupWikiLinks() {
	const wikiLink = {
		name: 'wikiLink',
		level: 'inline',
		start(src) {
			return src.indexOf('[[');
		},
		tokenizer(src) {
			const match = src.match(/^\[\[([^\]]+)\]\]/);
			if (match) {
				return {
					type: 'wikiLink',
					raw: match[0],
					text: match[1].trim()
				};
			}
		},
		renderer(token) {
			const path = resolveWikiLink(token.text);
			if (path) {
				return `<a class="wiki-link" data-path="${path}">${token.text}</a>`;
			}
			return `<a class="wiki-link broken">${token.text}</a>`;
		}
	};
	marked.use({ breaks: true, extensions: [wikiLink] });
}

async function refreshTree() {
	const openIds = new Set();
	document.querySelectorAll(".tree input[type='checkbox']:checked").forEach(cb => {
		openIds.add(cb.id);
	});

	const tree = await fetchTree();
	nodeIndex = flattenNodes(tree);
	renderTree(tree);

	openIds.forEach(id => {
		const cb = document.getElementById(id);
		if (cb) cb.checked = true;
	});
}

function connectSSE() {
	const evtSource = new EventSource('/api/events');

	evtSource.addEventListener('tree-changed', () => {
		// Skip if we just saved (within 1 second)
		if (Date.now() - lastSaveTime < 1000) return;

		clearTimeout(sseRefreshTimer);
		sseRefreshTimer = setTimeout(() => {
			refreshTreeFromSSE();
		}, 200);
	});

	evtSource.onerror = () => {
		console.log('SSE connection lost, will auto-reconnect');
	};
}

async function refreshTreeFromSSE() {
	const selectedPath = currentPath;

	await refreshTree();

	if (selectedPath) {
		const stillExists = nodeIndex.some(n => n.path === selectedPath);
		if (stillExists) {
			revealInTree(selectedPath);
		} else if (!editing) {
			document.getElementById("content-title").innerText = "File removed";
			document.getElementById("viewer").innerHTML =
				"<p>The file you were viewing was removed or renamed.</p>";
			currentPath = "";
		}
	}

	fetchAllTags();
}

function renderTree(tree) {
	const rootNode = document.getElementById("tree");

	for (let index = 0; index < rootNode.children.length; index++) {
		const child = rootNode.children[index];
		rootNode.removeChild(child);
	}

	renderTreeElement(rootNode, tree, "");
}

function renderTreeElement(rootElement, rootFolder, parentPath) {
	const ul = document.createElement("ul");

	for (let index = 0; index < rootFolder.folders.length; index++) {
		const folder = rootFolder.folders[index];
		const folderPath = parentPath + "/" + folder.name;
		const li = document.createElement("li");

		const checkbox = document.createElement("input");
		const label = document.createElement("label");

		checkbox.type = "checkbox";
		checkbox.id = "folder:" + folderPath;
		label.htmlFor = "folder:" + folderPath;

		const folderIcon = document.createElement("span");
		folderIcon.className = "folder-icon";
		label.appendChild(folderIcon);
		label.appendChild(document.createTextNode(folder.name));

		li.appendChild(checkbox);
		li.appendChild(label);

		renderTreeElement(li, folder, folderPath);
		ul.appendChild(li);
	}

	if (rootFolder.nodes != null) {
		for (let fileIndex = 0; fileIndex < rootFolder.nodes.length; fileIndex++) {
			const node = rootFolder.nodes[fileIndex];
			const li = document.createElement("li");
			const span = document.createElement("span");
			span.innerText = node.title;
			span.setAttribute("data-path", node.path);
			span.addEventListener("click", function(){
				document.querySelectorAll(".tree li > span.active").forEach(el => el.classList.remove("active"));
				span.classList.add("active");
				loadNode(node.path);
				if (window.innerWidth < 768) toggleSidebar();
			});
			li.appendChild(span);
			ul.appendChild(li);
		}
	}

	rootElement.appendChild(ul);

	return ul;
}

async function loadNode(path) {
	const response = await fetch('/api/get?node=' + encodeURIComponent(path));
	if (!response.ok) {
		const message = `An error has occured: ${response.status}`;
		throw new Error(message);
	}

	const node = await response.json();

	// Update title
	const titleEl = document.getElementById("content-title");
	const filename = path.split("/").pop().replace(/\.md$/, "");
	titleEl.innerText = (node.data.meta && node.data.meta.title) || filename;

	// Store raw content and render
	currentPath = path;
	localStorage.setItem("currentNode", path);
	currentContent = node.data.content;
	savedContent = node.data.content;
	currentMeta = node.data.meta;
	savedMeta = currentMeta ? { ...currentMeta } : null;
	tagsModified = false;
	const viewer = document.getElementById("viewer");

	// Reset to viewer mode
	editing = false;
	viewer.innerHTML = "";
	renderTags(viewer, node.data.meta);
	const article = document.createElement("div");
	article.innerHTML = marked.parse(currentContent);
	viewer.appendChild(article);
	hljs.highlightAll();
	viewer.classList.remove("hidden");
	document.getElementById("editor-wrapper").classList.add("hidden");
	resetFrontmatterPanel();
	document.getElementById("btn-edit").innerText = "Edit";
	styleEditButton("edit");
	document.getElementById("btn-save").classList.add("hidden");

	document.getElementById("btn-edit").classList.remove("hidden");
	document.getElementById("outline").classList.remove("hidden");
	attachLinkHandlers();
	updateOutline(currentContent);
	revealInTree(path);
}

function revealInTree(path) {
	document.querySelectorAll(".tree li > span.active").forEach(el => el.classList.remove("active"));

	const span = document.querySelector(`.tree li > span[data-path="${CSS.escape(path)}"]`);
	if (!span) return;

	span.classList.add("active");

	// Expand parent folders by checking their checkboxes
	let el = span.closest("li");
	while (el) {
		const parent = el.parentElement?.closest("li");
		if (parent) {
			const checkbox = parent.querySelector(":scope > input[type='checkbox']");
			if (checkbox) checkbox.checked = true;
		}
		el = parent;
	}

	span.scrollIntoView({ block: "nearest" });
}

function updateOutline(markdown) {
	const container = document.getElementById("outline");
	container.innerHTML = "";

	const outline = parseOutlineFromMarkdown(markdown);
	if (outline.length === 0) {
		return;
	}

	const title = document.createElement("div");
	title.className = "outline-title";
	title.innerText = "Outline";
	container.appendChild(title);

	container.appendChild(buildOutlineList(outline));
}

function parseOutlineFromMarkdown(markdown) {
	const flat = [];
	const lines = markdown.split("\n");

	for (const line of lines) {
		const match = line.match(/^(#{1,6})\s+(.+)/);
		if (!match) continue;
		flat.push({
			level: match[1].length,
			text: match[2].trim(),
			children: []
		});
	}

	// Build nested tree
	const root = [];
	const stack = [];

	for (const entry of flat) {
		while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
			stack.pop();
		}
		if (stack.length === 0) {
			root.push(entry);
			stack.push(entry);
		} else {
			stack[stack.length - 1].children.push(entry);
			stack.push(entry);
		}
	}

	return root;
}

function buildOutlineList(entries) {
	const ul = document.createElement("ul");
	for (const entry of entries) {
		const li = document.createElement("li");
		const a = document.createElement("a");
		a.innerText = entry.text;
		a.addEventListener("click", () => {
			const viewer = document.getElementById("viewer");
			const headings = viewer.querySelectorAll("h1, h2, h3, h4, h5, h6");
			for (const h of headings) {
				if (h.textContent === entry.text) {
					h.scrollIntoView({ behavior: "smooth" });
					break;
				}
			}
		});
		li.appendChild(a);
		if (entry.children && entry.children.length > 0) {
			li.appendChild(buildOutlineList(entry.children));
		}
		ul.appendChild(li);
	}
	return ul;
}

async function fetchAllTags() {
	const response = await fetch("/api/tags");
	if (response.ok) {
		const data = await response.json();
		allTags = data.tags || [];
	}
}

function renderTags(container, meta) {
	const tagsEl = document.createElement("div");
	tagsEl.id = "content-tags";
	tagsEl.className = "flex flex-wrap items-center gap-1.5 mb-4";

	const currentTags = getCurrentTags(meta);
	for (const tag of currentTags) {
		tagsEl.appendChild(createTagChip(tag));
	}

	tagsEl.appendChild(createTagInput());
	container.appendChild(tagsEl);
}

function getCurrentTags(meta) {
	if (!meta || !meta.tags) return [];
	return meta.tags.split(",").map(t => t.trim()).filter(t => t !== "");
}

function createTagChip(tag) {
	const span = document.createElement("span");
	span.className = "tag-chip";

	const text = document.createElement("span");
	text.className = "tag-chip-text";
	text.textContent = tag;
	text.addEventListener("click", () => searchByTag(tag));
	span.appendChild(text);

	const removeBtn = document.createElement("span");
	removeBtn.className = "tag-chip-remove";
	removeBtn.innerHTML = "&times;";
	removeBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		removeTag(tag);
	});
	span.appendChild(removeBtn);

	return span;
}

function createTagInput() {
	const wrapper = document.createElement("div");
	wrapper.className = "tag-input-wrapper";

	const input = document.createElement("input");
	input.type = "text";
	input.id = "tag-input";
	input.placeholder = "Add tag...";
	input.className = "tag-input";
	input.autocomplete = "off";

	const dropdown = document.createElement("div");
	dropdown.id = "tag-dropdown";
	dropdown.className = "tag-dropdown hidden";

	input.addEventListener("input", () => {
		tagDropdownIndex = -1;
		const val = input.value.trim().toLowerCase();
		dropdown.innerHTML = "";
		if (!val) {
			dropdown.classList.add("hidden");
			return;
		}
		const currentTags = getCurrentTags(currentMeta);
		const matches = allTags.filter(t =>
			t.toLowerCase().includes(val) && !currentTags.includes(t)
		);
		if (matches.length === 0) {
			dropdown.classList.add("hidden");
			return;
		}
		for (const match of matches) {
			const item = document.createElement("div");
			item.className = "tag-dropdown-item";
			item.textContent = match;
			item.addEventListener("mousedown", (e) => {
				e.preventDefault();
				addTag(match);
				input.value = "";
				dropdown.classList.add("hidden");
			});
			dropdown.appendChild(item);
		}
		dropdown.classList.remove("hidden");
	});

	let tagDropdownIndex = -1;

	input.addEventListener("keydown", (e) => {
		const items = dropdown.querySelectorAll(".tag-dropdown-item");
		if (e.key === "ArrowDown") {
			e.preventDefault();
			tagDropdownIndex = Math.min(tagDropdownIndex + 1, items.length - 1);
			updateTagDropdownActive(items, tagDropdownIndex);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			tagDropdownIndex = Math.max(tagDropdownIndex - 1, -1);
			updateTagDropdownActive(items, tagDropdownIndex);
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (tagDropdownIndex >= 0 && items[tagDropdownIndex]) {
				addTag(items[tagDropdownIndex].textContent);
			} else {
				const val = input.value.trim();
				if (val) addTag(val);
			}
			input.value = "";
			dropdown.classList.add("hidden");
			tagDropdownIndex = -1;
		} else if (e.key === "Escape") {
			input.value = "";
			dropdown.classList.add("hidden");
			tagDropdownIndex = -1;
		}
	});

	input.addEventListener("blur", () => {
		dropdown.classList.add("hidden");
	});

	wrapper.appendChild(input);
	wrapper.appendChild(dropdown);
	return wrapper;
}

function updateTagDropdownActive(items, activeIndex) {
	items.forEach((el, i) => {
		el.classList.toggle("active", i === activeIndex);
	});
	if (items[activeIndex]) {
		items[activeIndex].scrollIntoView({ block: "nearest" });
	}
}

function addTag(tag) {
	const currentTags = getCurrentTags(currentMeta);
	if (currentTags.includes(tag)) return;
	currentTags.push(tag);
	updateMetaTags(currentTags);
}

function removeTag(tag) {
	const currentTags = getCurrentTags(currentMeta).filter(t => t !== tag);
	updateMetaTags(currentTags);
}

function updateMetaTags(tags) {
	if (!currentMeta) currentMeta = {};
	if (tags.length > 0) {
		currentMeta.tags = tags.join(", ");
	} else {
		delete currentMeta.tags;
	}
	tagsModified = true;

	// Re-render tags in viewer
	const container = document.getElementById("content-tags");
	if (container) {
		container.innerHTML = "";
		for (const tag of tags) {
			container.appendChild(createTagChip(tag));
		}
		container.appendChild(createTagInput());
	}

	// Show save button
	const btnSave = document.getElementById("btn-save");
	btnSave.classList.remove("hidden");
	btnSave.disabled = false;
}

function searchByTag(tag) {
	const lower = tag.toLowerCase();
	const matches = nodeIndex.filter(node => {
		if (!node.meta || !node.meta.tags) return false;
		const tags = node.meta.tags.split(",").map(t => t.trim().toLowerCase());
		return tags.includes(lower);
	});

	// Update header
	document.getElementById("content-title").innerText = "Tag: " + tag;

	// Hide editor, outline, show viewer
	const viewer = document.getElementById("viewer");
	editing = false;
	document.getElementById("editor-wrapper").classList.add("hidden");
	resetFrontmatterPanel();
	viewer.classList.remove("hidden");
	document.getElementById("btn-edit").innerText = "Edit";
	styleEditButton("edit");
	document.getElementById("btn-save").classList.add("hidden");
	document.getElementById("btn-edit").classList.add("hidden");
	document.getElementById("outline").innerHTML = "";
	document.getElementById("outline").classList.add("hidden");

	// Render results
	viewer.innerHTML = "";

	if (matches.length === 0) {
		viewer.innerHTML = "<p>No documents found with this tag.</p>";
		return;
	}

	const heading = document.createElement("h1");
	heading.innerText = matches.length + " document" + (matches.length !== 1 ? "s" : "") + " tagged \"" + tag + "\"";
	viewer.appendChild(heading);

	const list = document.createElement("ul");
	for (const node of matches) {
		const li = document.createElement("li");
		const a = document.createElement("a");
		a.innerText = node.title;
		a.href = "#";
		a.addEventListener("click", e => {
			e.preventDefault();
			loadNode(node.path);
			if (window.innerWidth < 768) toggleSidebar();
		});
		li.appendChild(a);

		if (node.meta && node.meta.tags) {
			const tagList = document.createElement("span");
			tagList.className = "search-result-tags";
			tagList.innerText = node.meta.tags;
			li.appendChild(tagList);
		}

		list.appendChild(li);
	}
	viewer.appendChild(list);
}

function styleEditButton(mode) {
	const btn = document.getElementById("btn-edit");
	btn.classList.remove("bg-blue-600", "hover:bg-blue-700", "text-white", "bg-red-600", "hover:bg-red-700");
	if (mode === "edit") {
		btn.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white");
	} else if (mode === "cancel") {
		btn.classList.add("bg-red-600", "hover:bg-red-700", "text-white");
	} else {
		btn.classList.add("bg-blue-600", "hover:bg-blue-700", "text-white");
	}
}

function resetFrontmatterPanel() {
	document.getElementById("frontmatter-panel").classList.add("hidden");
	document.getElementById("frontmatter-fields").innerHTML = "";
	document.getElementById("icon-fm-open").classList.remove("hidden");
	document.getElementById("icon-fm-close").classList.add("hidden");
}

function toggleFrontmatter() {
	const panel = document.getElementById("frontmatter-panel");
	panel.classList.toggle("hidden");
	const isOpen = !panel.classList.contains("hidden");
	document.getElementById("icon-fm-open").classList.toggle("hidden", isOpen);
	document.getElementById("icon-fm-close").classList.toggle("hidden", !isOpen);
	if (isOpen) {
		document.getElementById("frontmatter-editor").focus();
	}
}

function loadFrontmatterEditor() {
	const container = document.getElementById("frontmatter-fields");
	container.innerHTML = "";
	if (!currentMeta) return;
	for (const [key, value] of Object.entries(currentMeta)) {
		addFrontmatterRow(key, value);
	}
}

function addFrontmatterRow(key, value) {
	const container = document.getElementById("frontmatter-fields");
	const row = document.createElement("div");
	row.className = "flex items-center gap-2";

	const keyInput = document.createElement("input");
	keyInput.type = "text";
	keyInput.value = key;
	keyInput.placeholder = "key";
	keyInput.className = "w-32 px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-black dark:text-gray-100 outline-none focus:border-blue-500";

	const valueInput = document.createElement("input");
	valueInput.type = "text";
	valueInput.value = value;
	valueInput.placeholder = "value";
	valueInput.className = "flex-1 px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-black dark:text-gray-100 outline-none focus:border-blue-500";

	const removeBtn = document.createElement("button");
	removeBtn.className = "text-gray-400 hover:text-red-500 cursor-pointer flex-none";
	removeBtn.title = "Remove field";
	removeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
	removeBtn.addEventListener("click", () => {
		row.remove();
		onFrontmatterChange();
	});

	keyInput.addEventListener("input", onFrontmatterChange);
	valueInput.addEventListener("input", onFrontmatterChange);

	row.appendChild(keyInput);
	row.appendChild(valueInput);
	row.appendChild(removeBtn);
	container.appendChild(row);
}

function onFrontmatterChange() {
	const rows = document.getElementById("frontmatter-fields").children;
	const hasChanges = document.getElementById("editor").value !== savedContent || getFrontmatterChanged();
	document.getElementById("btn-save").disabled = !hasChanges;
	document.getElementById("btn-edit").innerText = hasChanges ? "Cancel" : "View";
	styleEditButton(hasChanges ? "cancel" : "view");
}

function getFrontmatterChanged() {
	const meta = collectFrontmatter();
	if (!currentMeta && Object.keys(meta).length === 0) return false;
	if (!currentMeta) return Object.keys(meta).length > 0;
	const origKeys = Object.keys(currentMeta);
	const newKeys = Object.keys(meta);
	if (origKeys.length !== newKeys.length) return true;
	for (const key of origKeys) {
		if (meta[key] !== currentMeta[key]) return true;
	}
	return false;
}

function collectFrontmatter() {
	const rows = document.getElementById("frontmatter-fields").children;
	const meta = {};
	for (const row of rows) {
		const inputs = row.querySelectorAll("input");
		const key = inputs[0].value.trim();
		const value = inputs[1].value.trim();
		if (key) meta[key] = value;
	}
	return meta;
}

function initResizeHandle() {
	const handle = document.getElementById("resize-handle");
	const toc = document.getElementById("toc");
	let dragging = false;

	handle.addEventListener("mousedown", (e) => {
		e.preventDefault();
		dragging = true;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	});

	document.addEventListener("mousemove", (e) => {
		if (!dragging) return;
		const width = Math.max(150, Math.min(e.clientX, 600));
		toc.style.width = width + "px";
	});

	document.addEventListener("mouseup", () => {
		if (!dragging) return;
		dragging = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	});
}

function applyDarkMode() {
	const stored = localStorage.getItem("darkMode");
	const isDark = stored !== null ? stored === "true" : window.matchMedia("(prefers-color-scheme: dark)").matches;
	document.documentElement.classList.toggle("dark", isDark);
	document.getElementById("icon-sun").classList.toggle("hidden", !isDark);
	document.getElementById("icon-moon").classList.toggle("hidden", isDark);
	syncHljsTheme(isDark);
}

function toggleSidebar() {
	const toc = document.getElementById("toc");
	const backdrop = document.getElementById("sidebar-backdrop");
	const isOpen = toc.classList.contains("sidebar-open");
	toc.classList.toggle("sidebar-open", !isOpen);
	backdrop.classList.toggle("hidden", isOpen);
}

function toggleDarkMode() {
	const isDark = document.documentElement.classList.toggle("dark");
	localStorage.setItem("darkMode", isDark);
	document.getElementById("icon-sun").classList.toggle("hidden", !isDark);
	document.getElementById("icon-moon").classList.toggle("hidden", isDark);
	syncHljsTheme(isDark);
}

function syncHljsTheme(isDark) {
	document.getElementById("hljs-light").media = isDark ? "none" : "all";
	document.getElementById("hljs-dark").media = isDark ? "all" : "none";
}

function initSearch() {
	document.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "k") {
			e.preventDefault();
			openSearch();
		}
		if (e.key === "Escape") {
			closeSearch();
		}
	});

	const input = document.getElementById("search-input");
	input.addEventListener("input", () => {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => performSearch(input.value.trim()), 200);
	});

	input.addEventListener("keydown", (e) => {
		const items = document.querySelectorAll("#search-results .search-item");
		if (e.key === "ArrowDown") {
			e.preventDefault();
			searchActiveIndex = Math.min(searchActiveIndex + 1, items.length - 1);
			updateSearchActive(items);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			searchActiveIndex = Math.max(searchActiveIndex - 1, 0);
			updateSearchActive(items);
		} else if (e.key === "Enter" && searchActiveIndex >= 0 && items[searchActiveIndex]) {
			e.preventDefault();
			items[searchActiveIndex].click();
		}
	});
}

function openSearch() {
	const backdrop = document.getElementById("search-backdrop");
	backdrop.classList.remove("hidden");
	const input = document.getElementById("search-input");
	input.value = "";
	document.getElementById("search-results").innerHTML = "";
	document.getElementById("search-facets").innerHTML = "";
	document.getElementById("search-facets").classList.add("hidden");
	searchActiveIndex = -1;
	lastSearchResults = [];
	lastSearchFacets = {};
	activeSearchFilters.clear();
	setTimeout(() => input.focus(), 50);
}

function closeSearch(e) {
	if (e && e.target !== document.getElementById("search-backdrop")) return;
	document.getElementById("search-backdrop").classList.add("hidden");
	document.getElementById("search-input").value = "";
	document.getElementById("search-results").innerHTML = "";
	document.getElementById("search-facets").innerHTML = "";
	document.getElementById("search-facets").classList.add("hidden");
	searchActiveIndex = -1;
	lastSearchResults = [];
	lastSearchFacets = {};
	activeSearchFilters.clear();
}

async function performSearch(query) {
	const resultsEl = document.getElementById("search-results");
	const facetsEl = document.getElementById("search-facets");

	if (!query) {
		resultsEl.innerHTML = "";
		facetsEl.innerHTML = "";
		facetsEl.classList.add("hidden");
		searchActiveIndex = -1;
		lastSearchResults = [];
		lastSearchFacets = {};
		activeSearchFilters.clear();
		return;
	}

	const response = await fetch("/api/search?q=" + encodeURIComponent(query));
	if (!response.ok) {
		resultsEl.innerHTML = '<div class="search-empty">Search failed</div>';
		return;
	}

	const data = await response.json();
	searchActiveIndex = -1;
	activeSearchFilters.clear();
	lastSearchResults = data.results || [];
	lastSearchFacets = (data.facets && data.facets.tags) ? data.facets.tags : [];

	renderSearchFacets();
	renderSearchResults();
}

function renderSearchFacets() {
	const facetsEl = document.getElementById("search-facets");
	facetsEl.innerHTML = "";

	if (lastSearchFacets.length === 0) {
		facetsEl.classList.add("hidden");
		return;
	}

	facetsEl.classList.remove("hidden");
	for (const facet of lastSearchFacets) {
		const chip = document.createElement("span");
		chip.className = "search-facet-chip" + (activeSearchFilters.has(facet.term) ? " active" : "");
		chip.textContent = facet.term + " (" + facet.count + ")";
		chip.addEventListener("click", () => {
			if (activeSearchFilters.has(facet.term)) {
				activeSearchFilters.delete(facet.term);
			} else {
				activeSearchFilters.add(facet.term);
			}
			renderSearchFacets();
			renderSearchResults();
		});
		facetsEl.appendChild(chip);
	}
}

function renderSearchResults() {
	const resultsEl = document.getElementById("search-results");
	searchActiveIndex = -1;

	let filtered = lastSearchResults;
	if (activeSearchFilters.size > 0) {
		filtered = lastSearchResults.filter(item => {
			if (!item.tags || item.tags.length === 0) return false;
			for (const f of activeSearchFilters) {
				if (!item.tags.includes(f)) return false;
			}
			return true;
		});
	}

	if (filtered.length === 0) {
		resultsEl.innerHTML = '<div class="search-empty">No results found</div>';
		return;
	}

	resultsEl.innerHTML = "";
	for (const item of filtered) {
		const div = document.createElement("div");
		div.className = "search-item";

		const title = document.createElement("div");
		title.className = "search-item-title";
		title.textContent = item.title || item.path;
		div.appendChild(title);

		if (item.fragments) {
			const frag = document.createElement("div");
			frag.className = "search-item-fragment";
			const text = Object.values(item.fragments).flat()[0];
			if (text) frag.innerHTML = text;
			div.appendChild(frag);
		}

		div.addEventListener("click", () => {
			closeSearch();
			loadNode(item.path);
		});

		resultsEl.appendChild(div);
	}
}

function updateSearchActive(items) {
	items.forEach((el, i) => {
		el.classList.toggle("active", i === searchActiveIndex);
	});
	if (items[searchActiveIndex]) {
		items[searchActiveIndex].scrollIntoView({ block: "nearest" });
	}
}

function attachLinkHandlers() {
	const viewer = document.getElementById("viewer");
	viewer.querySelectorAll("a").forEach(a => {
		const wikiPath = a.getAttribute("data-path");
		if (wikiPath) {
			a.addEventListener("click", e => {
				e.preventDefault();
				loadNode(wikiPath);
			});
			return;
		}

		const href = a.getAttribute("href");
		if (href && href.endsWith(".md")) {
			a.addEventListener("click", e => {
				e.preventDefault();
				loadNode(href);
			});
		} else if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
			a.setAttribute("target", "_blank");
			a.setAttribute("rel", "noopener noreferrer");
		}
	});
}
