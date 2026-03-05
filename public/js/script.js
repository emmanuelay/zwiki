document.addEventListener('DOMContentLoaded', onLoad);

// Flat index of all nodes for wiki-link resolution
let nodeIndex = [];
let currentContent = "";
let savedContent = "";
let currentPath = "";
let editing = false;

function onLoad(event) {
	document.getElementById("btn-edit").addEventListener("click", toggleEditor);
	document.getElementById("btn-save").addEventListener("click", saveNode);
	document.getElementById("editor").addEventListener("input", onEditorInput);

	fetchTree()
		.then(tree => {
			nodeIndex = flattenNodes(tree);
			setupWikiLinks();
			renderTree(tree);
		})
		.catch(error => {
			console.log("fetch failed", error)
		});
}

function onEditorInput() {
	const editor = document.getElementById("editor");
	const hasChanges = editor.value !== savedContent;
	document.getElementById("btn-save").disabled = !hasChanges;
	document.getElementById("btn-edit").innerText = hasChanges ? "Cancel" : "View";
	updateOutline(editor.value);
}

function toggleEditor() {
	const viewer = document.getElementById("viewer");
	const editor = document.getElementById("editor");
	const btnEdit = document.getElementById("btn-edit");
	const btnSave = document.getElementById("btn-save");

	editing = !editing;

	if (editing) {
		editor.value = currentContent;
		viewer.classList.add("hidden");
		editor.classList.remove("hidden");
		btnSave.classList.remove("hidden");
		btnSave.disabled = true;
		btnEdit.innerText = "View";
		editor.focus();
	} else {
		currentContent = savedContent;
		viewer.innerHTML = marked.parse(currentContent);
		attachLinkHandlers();
		updateOutline(currentContent);
		editor.classList.add("hidden");
		btnSave.classList.add("hidden");
		viewer.classList.remove("hidden");
		btnEdit.innerText = "Edit";
	}
}

async function saveNode() {
	const editor = document.getElementById("editor");
	const content = editor.value;

	const response = await fetch('/api/update?node=' + encodeURIComponent(currentPath), {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content: content })
	});

	if (!response.ok) {
		console.log("save failed", response.status);
		return;
	}

	savedContent = content;
	currentContent = content;
	document.getElementById("btn-save").disabled = true;
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
		label.innerText = folder.name;

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
			ahref.addEventListener("click", function(){loadNode(node.path)});
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

	// Update tags
	const tagsEl = document.getElementById("content-tags");
	tagsEl.innerHTML = "";
	if (node.data.meta && node.data.meta.tags) {
		const tags = node.data.meta.tags.split(",");
		for (const tag of tags) {
			const span = document.createElement("span");
			span.innerText = tag.trim();
			tagsEl.appendChild(span);
		}
	}

	// Store raw content and render
	currentPath = path;
	currentContent = node.data.content;
	savedContent = node.data.content;
	const viewer = document.getElementById("viewer");
	const editor = document.getElementById("editor");

	// Reset to viewer mode
	editing = false;
	viewer.innerHTML = marked.parse(currentContent);
	viewer.classList.remove("hidden");
	editor.classList.add("hidden");
	document.getElementById("btn-edit").innerText = "Edit";
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
