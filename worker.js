const server = require('http').createServer();
const p2p = require('socket.io').listen(server);
const network = require('socket.io-client');
const socket = network.connect('http://localhost:3000', { reconnect: true });
const vm = require('vm');
const console = require('util');

let memory = [];
let resetMemory = () => memory = [];

let CHUNKSIZE = 1;
let resetScaling = () => CHUNKSIZE = 1;
let increaseScaling = () => CHUNKSIZE++;

let processConnections = connections => {
};

let store = value => {
	console.log(`STOR: ${JSON.stringify(value)}`);

	let components = {
		action: value.action,
		data: value.data,
		fn: value.fn ? value.fn.replace(/\s\s+/g, ' ') : undefined,
	};

	if (components.data && components.fn && !(['done', 'find'].includes(components.action))) {
		execute({
			action: components.action,
			data: components.data,
			fn: components.fn,
		});
	} else if (components.action === 'find') {
		socket.emit('kvs-find', memory.map(element => element.k), processConnections);
	}
};

let execute = components => {

	let { action, data, fn } = components;

	let process = data => {
		let context = vm.createContext({
			console,
			data
		});

		console.log(`PROC: ${JSON.stringify(data)}`);
		let result = vm.runInContext(`((${fn})(data))`, context);

		if (typeof result !== 'undefined') {

			let content = {
				action: action
			};

			if (action === 'reduce') {
				content.result = {
					key: data[0].key,
					value: result
				};
			} else {
				content.result = result;
			}

			let memKey = `${action}/${content.result.key}`;

			memory.push({
				k: memKey,
				v: content.result
			});

			socket.emit('p2p-haveKey', memKey);
		}
	};

	if (action === 'map') {
		data.forEach(process);
	} else {
		process(data);
	}

	socket.emit(`get-chunk`, increaseScaling(), store);
};

socket.on('disconnect', () => {
	resetMemory();
	resetScaling();
	console.log('DISC: Disconnected');
});

socket.on('connect', () => {
	console.log('CONN: Connected');
	server.listen(0, '127.0.0.1');

	resetMemory();
	resetScaling();

	socket.emit('get-chunk', increaseScaling(), store);
});

p2p.on('connection', socket => {
	socket.on('hello', console.log.bind(console));
});

server.on('listening', () => {
	socket.emit('p2p-register', server.address());
});
