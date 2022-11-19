import { Router } from 'express';
import crypto from 'crypto';
import { activityPush, DOMAIN, sendWebhook, users } from './main.js';
import auth from './authentication.js';

// hkgi serves as a iDP (Identity Provider). hkgi allows 3rd party applications
// to verify the identity of a user. The identity verification process is as
// follows:
// 1. 3rd party application POSTs to `/idp/verify/USERNAME` with an optional
//    `webhookUrl` in the body. The response will be a Verification Request
// 2. Via the Slack App, the User will recieve a message to verify the
//    Verification Request. Alternatively, they can also POST to
//    `/idp/verificationAttemt/ID/verify` with the proper authentication header
// 3. Once successfuly verified, the 3rd party application will recieve a POST
//    to the `webhookUrl` (if provided in Step 1). The successful verification
//    will also appear in the activity feed.
// 4. (optional) If the 3rd party application did not recieve the webhook, they
//    can GET `/idp/verificationAttempt/ID` to see if the verification was
//    successful.

export const router = Router();

// For 3rd party apps to verify the identity of a user.
router.post('/verify/:username', async (req, res) => {
	const username = req.params.username;
	const webhookUrl = req.body.webhookUrl;

	// Check if user exists
	if (users[username] === undefined) {
		return res.status(404).json({ ok: false, msg: 'User not found' });
	}

	// Create Verification Request
	const id = uniqueId();
	const url = 'http://' + DOMAIN + '/idp/verificationAttempt/' + id;
	const verifyUrl = url + '/verify';
	const verificationRequest = {
		id,
		url,
		verifyUrl,
		webhookUrl: webhookUrl || null,
		attempts: [],
		verifiedAt: null,
		createdAt: Date.now(),
	};

	// Save Verification Request to database
	if (!users[username].verificationRequests)
		users[username].verificationRequests = {};
	users[username].verificationRequests[id] = verificationRequest;

	// Remove fields before sending Verification Request in response
	const vr = Object.assign({}, verificationRequest); // clone
	delete vr.webhookUrl;

	res.json({ ok: true, verificationAttempt: vr });

	// Add event to activity
	activityPush('verificationRequest', {
		id: verificationRequest.id,
		who: username,
	});
});

// For the Slack bot (or user) to verify the Verification Request that was
// created by a 3rd party application.
router.post(
	'/verificationAttempt/:id/verify',
	auth({
		callback: (req, username, state) => {
			// Log failed verification attempts
			if (state.ok) return;

			const vrId = req.params.id;

			// Check if verification request exists
			if (users[username]?.verificationRequests?.[vrId] === undefined) return;

			// Check if verification request was already successful, don't log attempt
			if (users[username].verificationRequests[vrId].verifiedAt) return;

			// Save verification attempt to database
			const attempt = {
				verified: false,
				attemptedAt: Date.now(),
			};
			users[username].verificationRequests[vrId].attempts.push(attempt);

			// Add event to activity
			activityPush('verificationAttempt', {
				verificationRequestId: vrId,
				...attempt,
			});
		},
	}),
	async (req, res) => {
		const username = req.user;
		const user = users[username];
		const id = req.params.id;

		// Check if verification attempt exists
		if (user.verificationRequests?.[id] === undefined) {
			return res.status(404).json({
				ok: false,
				msg: "You're authentication, but verification attempt was not found",
			});
		}

		// Check if verification request was already successful, don't log attempt
		if (user.verificationRequests[id].verifiedAt) return res.json({ ok: true });

		// Save successful verification request to database
		const verifiedAt = Date.now();
		const attempt = {
			verified: true,
			attemptedAt: verifiedAt,
		};
		user.verificationRequests[req.params.id].verifiedAt = verifiedAt;
		user.verificationRequests[req.params.id].attempts.push(attempt);

		res.json({ ok: true });

		// Send webhook if provided
		const webhookUrl = user.verificationRequests[req.params.id].webhookUrl;
		if (webhookUrl)
			sendWebhook(webhookUrl, user.verificationRequests[req.params.id]);

		// Add event to activity
		activityPush('verificationAttempt', {
			verificationRequestId: id,
			...attempt,
		});
	}
);

router.get('/verificationAttempt/:id', async (req, res) => {
	const id = req.params.id;

	// Check if verification attempt exists
	let va;
	let user;
	for (const currUser in users) {
		if (!users[currUser].verificationRequests) continue;
		for (const vrid of Object.keys(users[currUser].verificationRequests)) {
			if (vrid === id) {
				user = users[currUser];
				va = users[currUser].verificationRequests[vrid];
				break;
			}
		}
	}
	if (va === undefined)
		return res
			.status(404)
			.json({ ok: false, msg: 'Verification request not found' });

	res.json({
		ok: true,
		verificationRequest: user.verificationRequests[id],
	});
});

// Helper functions

const generateId = () => {
	return (1e10)
		.toString()
		.replace(/[018]/g, (c) =>
			(
				c ^
				(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
			).toString(16)
		);
};
export const uniqueId = () => {
	const existingids = Object.keys(users)
		.map((u) => users[u].verificationRequests)
		.filter((va) => va)
		.flatMap((va) => Object.keys(va));

	for (let i = 0; i < Number.MAX_SAFE_INTEGER; i++) {
		const id = generateId();
		if (!existingids.includes(id)) return id;
	}
	throw new Error('Ran out of possible unique IDs');
};

export { router as idpRouter };
