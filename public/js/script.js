document.addEventListener('DOMContentLoaded', onLoad);

function onLoad(event) {
	console.log("domcontentloaded");

	fetchTree()
		.then(renderTree)
		.catch(error => {
			console.log("fetch failed", error)
		});
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
	console.log("rendertree - tree: ", tree);

	const rootNode = document.getElementById("toc");
	console.log("rendertree - remove " + rootNode.children.length + " children");

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
				li.innerText = node.title;
				returned.appendChild(li);
			}
		}
	}

	rootElement.appendChild(ul);
	
	return ul;
}