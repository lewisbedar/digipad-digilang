module.exports = {
	apps: [{
		name: 'Digipad',
		script: './server/app.js',
		node_args: [
			'--expose-gc'
		],
		autorestart: true,
		max_restarts: 10,
		env: {
			'NODE_ENV': 'development'
		},
		env_production: {
			'NODE_ENV': 'production'
		}
	}]
}