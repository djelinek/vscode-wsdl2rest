/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as extensionTest from './extension.test';
import * as fs from 'fs';
import * as path from 'path';
import * as webserver from '../test/app_soap';
import { projectPath, getPackageData } from './package_data';
import { VSBrowser } from 'vscode-extension-tester';
import { installTest, stageTest } from 'vscode-uitests-tooling';

describe('All tests', function () {
	installTest({
		displayName: 'wsdl2rest by Red Hat',
		testTitle: 'Install test',
		timeouts: {
			findExtension: 70000,
			installExtension: 100000,
			marketplaceClose: 70000,
			marketplaceOpen: 70000,
			verifyInstalled: 70000
		}
	});

	stageTest({
		publisher: 'Red Hat',
		commands: getPackageData().contributes.commands.map((command) => command.title),
		displayName: 'wsdl2rest by Red Hat',
		testTitle: 'Stage test',
		timeouts: {
			commandTests: 70000,
			findExtension: 70000,
			marketplaceClose: 70000,
			marketplaceOpen: 70000,
			verifications: 70000
		}
	});

	describe('Extension tests', function () {
		this.timeout(60000);
		let browser: VSBrowser;

		before('Setup environment', async function () {
			browser = VSBrowser.instance;
			webserver.startWebService();
		});

		after('Clear environment', async function () {
			webserver.stopWebService();
		});

		for (const f of walk(path.join(projectPath, 'src/ui-test/test-data'))) {
			assert(f.endsWith('.json'), `${f} is not json file`);
			const fileContent = fs.readFileSync(f, { encoding: 'utf8' });
			extensionTest.test(JSON.parse(fileContent));
		}
	});

});

/**
 * Iterates over all files which are children of `dir`.
 * @param dir starting directory
 * @returns iterable object of file absolute paths
 */
function* walk(dir: string): Iterable<string> {
	const stack = [dir];

	while (stack.length > 0) {
		const file = stack.pop();
		const stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			// add directories and files to stack and transform filenames to absolute paths
			stack.push(...fs.readdirSync(file).map(f => path.join(file, f)));
		} else {
			yield file;
		}
	}
}
