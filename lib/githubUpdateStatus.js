'use strict';

var execSync = require('child_process').execSync;
var GitHub = require('github-api');

function isFunction(functionToCheck) {
	return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

module.exports = function (grunt) {


	/**
	 * Any input can be declared here as a function, if desired.
	 * Valid input is
	 * {
	 *   status: string|function (required: Value can be 'pending',
	 *     'error', 'failure', or 'success'),
	 *   targetUrl: string|function (optional, url linking back to some test page or build status),
	 *   description: string|function (optional, short descriptive text),
	 *   context: string|function (optional, a heading under which this status affects,
	 *     like build vs test vs coverage. One commit can have multiple statuses),
	 *
	 *   options: {
	 *     commitSha: string (optional, if not provided,
	 *       will try to run 'git rev-parse HEAD')
	 *     token: string (optional, if absent, will check
	 *       GITHUB_TOKEN environment var from process.env.GITHUB_TOKEN,
	 *       this is good for CI environments like Codeship where
	 *       environment vars may be encrypted in a file.),
	 *     user: string (name of the user),
	 *     repo: string (name of the repo)
	 *   }
	 * }
	 *
	 * or
	 *
	 * {
	 *   updates: [
	 *     {
	 *       status: 'pending',
	 *       targetUrl: 'http://some.place/here/is',
	 *       description: 'This test hasn\'t run yet.',
	 *       context: 'test'
	 *     },
	 *     {
	 *       status: 'success',
	 *       targetUrl: () => `http://some.place/build/${myBuildId}/log`,
	 *       description: () => `Build succeeded in ${ build_time } seconds`,
	 *       context: 'build'
	 *     }
	 *   ]
	 * }
	 *
	 */
	grunt.registerMultiTask('github-update-status',
		'Sends status updates to GitHub via the GitHub api for your current branch and commit', function () {
			var done = this.async();

			var options = this.data.options || {};
			var user = options.user;
			var repo = options.repo;
			var token = options.token;
			var commitSha = options.commitSha;

			if (!user) {
				grunt.log.error('Key "user" missing in options ' +
					'(usually the owner or organization)\n' +
					'e.g. https://github.com/<user>/<repo>');
				done(false);
				return;
			}

			if (!repo) {
				grunt.log.error('Key "repo" missing in options ' +
					'(the name of the repository)\n' +
					'e.g. https://github.com/<user>/<repo>');
				done(false);
				return;
			}

			if (isFunction(user)) {
				user = user();
			}

			if (isFunction(repo)) {
				repo = repo();
			}

			if (!token) {
				grunt.log.writeln('GitHub "token" not in options, checking env for GITHUB_TOKEN');
				token = process.env.GITHUB_TOKEN;
				if (!token) {
					grunt.log.error('Nope! Couldn\'t find it.');
					done(false);
					return;
				}
			} else if (isFunction(token)) {
				token = token();
			}

			var githubApi = new GitHub({ token: token });

			if (!commitSha) {
				grunt.log.writeln('Pulling commit SHA using "git rev-parse HEAD"');
				commitSha = execSync('git rev-parse HEAD');
			} else if (isFunction(commitSha)) {
				commitSha = commitSha();
			}

			var updates;
			if (this.data.updates && Array.isArray(this.data.updates)) {
				updates = this.data.updates;
			} else {
				updates = [{
					context: this.data.context,
					state: this.data.state,
					description: this.data.description,
					targetUrl: this.data.targetUrl,
				}];
			}

			/**
			 * @type {Repository}
			 */
			var repository = githubApi.getRepo(user, repo);

			var failed = false;
			var requests = 0;
			var completed = 0;

			updates.forEach(function (update) {
				var state = update.state;
				var context = update.context;
				var targetUrl = update.targetUrl;
				var description = update.description;

				if (!state) {
					grunt.log.error('Missing state for github api updater: ' + JSON.stringify(update));
					failed = true;
					return;
				}

				if (isFunction(state)) {
					state = state();
				}

				if (typeof state !== 'string') {
					grunt.log.error('state which was passed as a function did not return a string!');
					failed = true;
					return;
				}

				var options = {
					state: state
				};

				if (isFunction(context)) {
					context = context();
				}

				if (isFunction(targetUrl)) {
					targetUrl = targetUrl();
				}

				if (isFunction(description)) {
					description = description();
				}

				if (typeof context === 'string') {
					options.context = context;
				}

				if (typeof targetUrl === 'string') {
					options.target_url = targetUrl;
				}

				if (typeof description === 'string') {
					options.description = description;
				}

				++requests;
				repository.updateStatus(commitSha, options,
					function (error) {
						if (error) {
							grunt.log.error('Error while updating status of ' + context + ' to ' + state + ':', error.response);
							failed = true;
						} else {
							grunt.log.ok(context + ' updated to ' + state + '.');
						}
						++completed;
						if (completed === requests) {
							doFinish();
						}
					}
				);
			});

			var doFinish = function () {
				done(!failed);
			};
		}
	);
};
