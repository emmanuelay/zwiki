document.addEventListener('DOMContentLoaded', onLoad);

// Flat index of all nodes for wiki-link resolution
let nodeIndex = [];
let currentContent = "";
let savedContent = "";
let currentPath = "";
let currentMeta = null;
let editing = false;

function onLoad(event) {
	document.getElementById("btn-edit").addEventListener("click", toggleEditor);
	document.getElementById("btn-save").addEventListener("click", saveNode);
	document.getElementById("editor").addEventListener("input", onEditorInput);
	document.getElementById("btn-darkmode").addEventListener("click", toggleDarkMode);
	document.getElementById("btn-frontmatter").addEventListener("click", toggleFrontmatter);
	document.getElementById("btn-add-field").addEventListener("click", () => addFrontmatterRow("", ""));

	// Restore dark mode preference
	if (localStorage.getItem("darkMode") === "true") {
		document.documentElement.classList.add("dark");
		document.getElementById("icon-sun").classList.remove("hidden");
		document.getElementById("icon-moon").classList.add("hidden");
	}

	fetchTree()
		.then(tree => {
			nodeIndex = flattenNodes(tree);
			setupWikiLinks();
			renderTree(tree);
			if (tree.nodes && tree.nodes.length > 0) {
				loadNode(tree.nodes[0].path);
			}
		})
		.catch(error => {
			console.log("fetch failed", error)
		});
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
	const editor = document.getElementById("editor");
	const content = editor.value;
	const meta = collectFrontmatter();

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
	editing = true;
	toggleEditor();
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
	marked.use({ extensions: [wikiLink] });
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

function renderTree(tree) {
	const rootNode = document.getElementById("tree");

	for (let index = 0; index < rootNode.children.length; index++) {
		const child = rootNode.children[index];
		rootNode.removeChild(child);
	}

	renderTreeElement(rootNode, tree);
}

function renderTreeElement(rootElement, rootFolder) {
	const ul = document.createElement("ul");

	for (let index = 0; index < rootFolder.folders.length; index++) {
		const folder = rootFolder.folders[index];
		const li = document.createElement("li");

		const checkbox = document.createElement("input");
		const label = document.createElement("label");

		checkbox.type = "checkbox";
		checkbox.id = folder.id;
		label.htmlFor = folder.id;

		const folderIcon = document.createElement("span");
		folderIcon.className = "folder-icon";
		label.appendChild(folderIcon);
		label.appendChild(document.createTextNode(folder.name));

		li.appendChild(checkbox);
		li.appendChild(label);

		renderTreeElement(li, folder);
		ul.appendChild(li);
	}

	if (rootFolder.nodes != null) {
		for (let fileIndex = 0; fileIndex < rootFolder.nodes.length; fileIndex++) {
			const node = rootFolder.nodes[fileIndex];
			const li = document.createElement("li");
			const span = document.createElement("span");
			const ahref = document.createElement("a");
			ahref.innerText = node.title;
			ahref.addEventListener("click", function(){
				document.querySelectorAll(".tree li span.active").forEach(el => el.classList.remove("active"));
				span.classList.add("active");
				loadNode(node.path);
			});
			span.appendChild(ahref);
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
	currentContent = node.data.content;
	savedContent = node.data.content;
	currentMeta = node.data.meta;
	const viewer = document.getElementById("viewer");

	// Reset to viewer mode
	editing = false;
	viewer.innerHTML = "";
	renderTags(viewer, node.data.meta);
	const article = document.createElement("div");
	article.innerHTML = marked.parse(currentContent);
	viewer.appendChild(article);
	viewer.classList.remove("hidden");
	document.getElementById("editor-wrapper").classList.add("hidden");
	resetFrontmatterPanel();
	document.getElementById("btn-edit").innerText = "Edit";
	styleEditButton("edit");
	document.getElementById("btn-save").classList.add("hidden");

	attachLinkHandlers();
	updateOutline(currentContent);
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

function renderTags(container, meta) {
	if (!meta || !meta.tags) return;

	const tagsEl = document.createElement("div");
	tagsEl.id = "content-tags";
	tagsEl.className = "flex flex-wrap gap-1.5 mb-4";

	const tags = meta.tags.split(",");
	for (const tag of tags) {
		const trimmed = tag.trim();
		const span = document.createElement("span");
		span.innerText = trimmed;
		span.addEventListener("click", () => searchByTag(trimmed));
		tagsEl.appendChild(span);
	}

	container.appendChild(tagsEl);
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
	document.getElementById("outline").innerHTML = "";

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

function toggleDarkMode() {
	const isDark = document.documentElement.classList.toggle("dark");
	localStorage.setItem("darkMode", isDark);
	document.getElementById("icon-sun").classList.toggle("hidden", !isDark);
	document.getElementById("icon-moon").classList.toggle("hidden", isDark);
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
