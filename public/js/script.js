document.addEventListener('DOMContentLoaded', onLoad);

// Flat index of all nodes for wiki-link resolution
let nodeIndex = [];

function onLoad(event) {
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

function toggleEditor(event) {
	const viewer = document.getElementById("node");
	const editor = document.getElementById("editor");
	editor.classList.toggle("hidden");
	viewer.classList.toggle("hidden");
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
	const response = await fetch('/api/get?node=' + path);
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

	// Render markdown content
	const viewer = document.getElementById("viewer");
	viewer.innerHTML = marked.parse(node.data.content);

	// Attach click handlers for internal links
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
		}
	});
}
