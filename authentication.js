import bcrypt from 'bcrypt';
import { users } from './main.js';

const auth = (options) => {
	const requirePassword = options?.requirePassword == false ? false : true;

	return async (req, res, next) => {
		const authHeader = req.headers.authorization;

		if (!authHeader || !authHeader.startsWith('Basic ')) {
			return res.json({
				ok: false,
				msg: 'missing authorization header',
			});
		}

		const [username, password] = Buffer.from(
			authHeader.replace('Basic ', ''),
			'base64'
		)
			.toString()
			.split(':');

		let state = {
			ok: true,
			msg: 'successful authenticated',
		};

		if (!users[username]) {
			state = {
				ok: false,
				msg: 'user not found',
			};
		}

		if (
			requirePassword &&
			!(await bcrypt.compare(password, users[username].passwordHash))
		) {
			state = {
				ok: false,
				msg: 'incorrect password',
			};
		}

		if (!state.ok) {
			if (options.callback) await options.callback(req, username, state);
			return res.json(state);
		}

		req.user = username;
		req.stead = users[username].stead;

		if (options.callback) await options.callback(req, username, state);

		next();
	};
};
export default auth;
