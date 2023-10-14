document.addEventListener('DOMContentLoaded', onLoad);

function onLoad(event) {
	console.log("domcontentloaded");

	const btnEdit = document.getElementById("btnEdit");
	btnEdit.addEventListener("click", toggleEditor)

	fetchTree()
		.then(renderTree)
		.catch(error => {
			console.log("fetch failed", error)
		});
}

function toggleEditor(event) {
	console.log("click");
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

function renderTree(tree) {
	console.log("rendertree - tree:", tree);
	const rootNode = document.getElementById("toc");

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
		const details = document.createElement("details");
		const summary = document.createElement("summary");

		summary.innerText = folder.id;
		details.appendChild(summary);
		li.appendChild(details);
		ul.appendChild(li);

		let returned = renderTreeElement(details, folder);

		if (folder.nodes != null) { 
			for (let fileIndex = 0; fileIndex < folder.nodes.length; fileIndex++) {
				const node = folder.nodes[fileIndex];
				const li = document.createElement("li");
				const ahref = document.createElement("a");
				ahref.innerText = node.title;
				ahref.addEventListener("click",function(){loadNode(node.id)})
				li.appendChild(ahref);
				returned.appendChild(li);
			}
		}
	}

	rootElement.appendChild(ul);
	
	return ul;
}

async function loadNode(path) {
	console.log("loadNode - attempting to load:", path);

	const response = await fetch('/api/get?node=' + path);
	if (!response.ok) {
		const message = `An error has occured: ${response.status}`;
		throw new Error(message);
	}
	
	const node = await response.json();
	console.log("loadNode - fetched", node);

	let content = document.getElementById("node")
	content.innerText = node.data.content;
}