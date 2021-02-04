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

import * as fs from 'fs-extra';
import * as path from 'path';
import * as webServer from '../test/app_soap';
import {
	Command,
	getPackageData,
	PackageData,
	projectPath
} from './package_data';
import {
	DefaultWait,
	Input,
	LogAnalyzer,
	Maven,
	Menu,
	OpenMethod,
	OutputViewExt,
	Project,
	WebElementConditions
} from 'vscode-uitests-tooling';
import { expect } from 'chai';
import {
	InputBox,
	NotificationsCenter,
	NotificationType,
	TitleBar,
	until,
	VSBrowser,
	Workbench
} from 'vscode-extension-tester';

type Runtime = 'spring' | 'blueprint';
type GenerationType = 'url' | 'file';

const mavenGoals = {
	spring: 'camel:run',
	blueprint: 'camel:run'
};

export interface TestArguments {
	camelMavenPluginVersion?: string;
	camelVersion: string;
	framework: Runtime;
	type: GenerationType;
}

interface RuntimeOutput {
	/**
	 * total Camel routes
	 */
	totalRoutes: string;
	/**
	 * started Camel routes
	 */
	startedRoutes: string;

	/**
	 * Camel version
	 */
	camelVersion: string;
}

interface InputOptions {
	message?: (message: string) => boolean;
	placeholder?: (placeholder: string) => boolean;
	text?: (text: string) => boolean;
	timeout?: number;
}

const RUNTIME_FOLDER = path.join(projectPath, 'src', 'ui-test', 'runtimes');
const WSDL_FILE = path.join(projectPath, 'src', 'test', 'address.wsdl');
const WSDL_URL = webServer.getWSDLURL();

// temp directory for testing
export const WORKSPACE_PATH = path.join(projectPath, '.ui-testing');

export function test(args: TestArguments) {
	// set of expected files from wsdl2rest process
	const expectedFiles = new Set(getExpectedFileList(args).map(f => path.join(WORKSPACE_PATH, f)));

	describe(`Extension test(${detailsString(args)})`, function () {
		let browser: VSBrowser;
		let workspace: Project;
		let packageData: PackageData = getPackageData();
		const command: Command = findCommand(args, packageData);

		if (args.camelMavenPluginVersion == null) {
			args.camelMavenPluginVersion = args.camelVersion;
		}

		before('Project setup', async function () {
			browser = VSBrowser.instance;
			workspace = await prepareWorkspace(this.timeout());

			// copy runtime project to temp testing folder, so we can start test scenario
			fs.copySync(path.join(RUNTIME_FOLDER, args.framework), WORKSPACE_PATH);

			// ensure expected files do not exist yet
			Array.from(expectedFiles).forEach(file => {
				expect(fs.existsSync(file), `File ${file} should not exist`).to.be.false;
			});
			await browser.waitForWorkbench();
		});

		after('Project cleanup', async function () {
			await clearWorkspace(workspace, this.timeout());
		});

		it('Open command palette', async function () {
			this.retries(3);
			await new TitleBar().select('View', 'Command Palette...');
			const input = await getInput({
				text: (text) => text === '>',
				timeout: timeout(this)
			});

			await input.setText(`>${command.title}`, timeout(this));
			await input.confirm(timeout(this));
		});

		it(`Open wsdl file - ${args.type}`, async function () {
			let file = '';
			let input: Input;
			switch (args.type) {
				case 'url':
					input = await getInput({
						placeholder: (text) => text === 'Provide the URL for the WSDL file',
						timeout: timeout(this)
					});
					expect(await input.getPlaceHolder()).to.be.equal('Provide the URL for the WSDL file');
					expect(await input.getMessage()).to.be.equal('WSDL URL (Press \'Enter\' to confirm or \'Escape\' to cancel)');
					file = WSDL_URL;
					break;
				case 'file':
					const defaultText = WORKSPACE_PATH.endsWith(path.sep) ? WORKSPACE_PATH : WORKSPACE_PATH + path.sep;
					input = await getInput({
						text: (text) => text === defaultText,
						timeout: timeout(this)
					});
					file = WSDL_FILE;
					break;
				default:
					expect.fail('Unsupported option');
					return null;
			}
			await input.setText(file, timeout(this));
			await input.confirm(timeout(this));
		});

		it(`Select -- ${args.framework} -- option`, async function () {
			const input = await getInput({
				placeholder: (text) => text === 'Specify which DSL to generate the Camel configuration for',
				timeout: timeout(this)
			});

			expect(await input.getPlaceHolder()).to.be.equal('Specify which DSL to generate the Camel configuration for');
			expect(await getQuickPicks(input)).to.be.deep.equal(['Spring', 'Blueprint']);

			await input.setText(args.framework, timeout(this));
			await input.confirm(timeout(this));
		});

		it(`Confirm output directory`, async function () {
			const input = await getInput({
				placeholder: (text) => text === 'Enter the output directory for generated artifacts',
				timeout: timeout(this)
			});

			expect(await input.getPlaceHolder()).to.be.equal('Enter the output directory for generated artifacts');
			expect(await input.getMessage()).to.be.equal('Output Directory (Press \'Enter\' to confirm or \'Escape\' to cancel)');
			expect(await input.getText()).to.be.equal('src/main/java');

			await input.confirm(timeout(this));
		});

		it('Confirm JAX-WS endpoint', async function () {
			const input = await getInput({
				placeholder: (text) => text.includes('Enter the address for the running jaxws endpoint'),
				timeout: timeout(this)
			});

			expect(await input.getPlaceHolder()).to.be.equal('Enter the address for the running jaxws endpoint (defaults to http://localhost:8080/somepath)');
			expect(await input.getMessage()).to.be.equal('JAXWS Endpoint (Press \'Enter\' to confirm or \'Escape\' to cancel)');

			await input.confirm(timeout(this));
		});

		it('Confirm JAX-RS endpoint', async function () {
			const input = await getInput({
				placeholder: (text) => text.includes('Enter the address for the jaxrs endpoint')
			});


			expect(await input.getPlaceHolder()).to.be.equal('Enter the address for the jaxrs endpoint (defaults to http://localhost:8081/jaxrs)');
			expect(await input.getMessage()).to.be.equal('JAXRS Endpoint (Press \'Enter\' to confirm or \'Escape\' to cancel)');

			await input.setText('http://localhost:8000/jaxrs', timeout(this));
			await input.confirm(timeout(this));
		});

		it('Convert wsdl project', async function () {
			this.timeout(100000);
			const resultRegex = /Process finished\. Return code (?<code>\d+)\./;

			const output = await OutputViewExt.open();

			while (!(await output.getChannelNames()).includes('WSDL2Rest'))
				/* spin lock - wait for channel to appear */;

			await output.selectChannel('WSDL2Rest');

			let text: string | null = null;
			let result: RegExpMatchArray | null = null;
			do {
				// ignore not clickable error
				text = await output.getText().catch(e => null);

				if (text === null) {
					continue;
				}

				result = text.match(resultRegex);
			} while (text === null || !result);

			await output.clearText();
			expect(result.groups['code'], 'Output did not finish with code 0').to.equal('0');
		});

		describe('Generated all files', function () {
			let notificationCenter: NotificationsCenter;

			before('Open notification center', async function () {
				this.retries(10);
				notificationCenter = await new Workbench().openNotificationsCenter();
				await browser.driver.wait(async () => await WebElementConditions.isInteractive(notificationCenter), this.timeout());
			});

			after('Close notification center', async function () {
				this.retries(10);
				if (notificationCenter) {
					await notificationCenter.close();
					await browser.driver.wait(
						async () => await WebElementConditions.isHidden(notificationCenter) ||
							await until.stalenessOf(notificationCenter).fn(browser.driver),
						this.timeout());
				}
			});

			it('Show notifications', async function () {
				this.retries(10);

				const notifications = await notificationCenter.getNotifications(NotificationType.Any);
				const errors: string[] = [];

				let notification = notifications.find(async n => await n.getMessage().catch(e => null) === `Created ${getCamelContextPath(args)}`);

				if (notification === undefined) {
					errors.push('Did not find camel context notification');
				}

				notification = notifications.find(async n => await n.getMessage().catch(e => null) === 'Created CXF artifacts for specified WSDL at src/main');

				if (notification === undefined) {
					errors.push('Did not find cxf notification');
				}

				notifications.forEach(async n => {
					const message = await n.getMessage().catch(e => null);
					if (message !== null) {
						console.log(`[DEBUG]: Notification message: ${message}`);
					}
				});

				if (errors.length > 0) {
					await DefaultWait.sleep(250);
					expect.fail(errors.join("\n"));
				}
			});

			for (const file of Array.from(expectedFiles)) {
				it(`Generated ${file}`, async function () {
					expect(fs.existsSync(file), `File ${file} does not exist`).to.be.true;
				});
			}
		});

		describe('Test generated project', function () {
			let maven: Maven = null;

			after('Make sure maven is not running', async function () {
				if (maven?.isRunning) {
					try {
						await maven.exit(false, this.timeout() / 2);
					}
					catch {
						await maven.exit(true, this.timeout() / 2);
					}
				}
			});

			it('Installs project', async function () {
				this.timeout(0);
				const exitCode = await prepareMavenProject(args);
				expect(exitCode).to.equal(0);
			});

			it('Run projects', async function () {
				// camel-maven-plugin must be downloaded
				this.timeout(250000);
				maven = executeProject(args);
				const data = await analyzeProject(maven);
				const expectedRoutesCount = getExpectedNumberOfRoutes(args);

				expect(parseInt(data.startedRoutes), "All routes were not started").to.equal(expectedRoutesCount);
				expect(parseInt(data.totalRoutes), "Number of routes does not match").to.equal(expectedRoutesCount);
				expect(data.camelVersion, "Camel version mismatch").to.equal(args.camelVersion);
			});
		});

	});
}

function findCommand(args: TestArguments, packageData: PackageData): Command {
	switch (args.type) {
		case 'url':
			return packageData.contributes.commands.find(x => x.command.endsWith('url'));
		case 'file':
			return packageData.contributes.commands.find(x => x.command.endsWith('local'));
		default:
			expect.fail('Unsupported option');
			return null;
	}
}

function detailsString(args: TestArguments): string {
	let segments: string[] = [];

	switch (args.type) {
		case 'url':
			segments.push(`url(${WSDL_URL})`);
			break;
		case 'file':
			segments.push(`file(${WSDL_FILE})`);
			break;
		default:
			expect.fail('Unsupported option');
			return null;
	}
	segments.push(args.framework);
	segments.push(`camel(${args.camelVersion})`);
	return segments.join(', ');
}

async function prepareMavenProject(args: TestArguments): Promise<number> {
	const maven = new Maven({
		args: ['clean', 'install'],
		properties: {
			'camel.version': args.camelVersion,
			'camel.maven.plugin.version': args.camelMavenPluginVersion
		},
		cwd: WORKSPACE_PATH
	});
	maven.spawn();

	// show progress of install
	maven.stdoutLineReader.on('line', console.log);

	return maven.wait();
}

function executeProject(args: TestArguments): Maven {
	const maven = new Maven({
		args: [mavenGoals[args.framework]],
		properties: {
			'camel.version': args.camelVersion,
			'camel.maven.plugin.version': args.camelMavenPluginVersion
		},
		cwd: WORKSPACE_PATH,
		timeout: 150000
	});
	maven.spawn();
	maven.stdoutLineReader.on('line', console.log);
	return maven;
}

async function analyzeProject(maven: Maven): Promise<RuntimeOutput> {
	const analyzer = new LogAnalyzer(maven.stdoutLineReader);

	analyzer.whenMatchesThenCaptureData(/.*Total (?<totalRoutes>\d+) routes, of which (?<startedRoutes>\d+) are started/);
	analyzer.whenMatchesThenCaptureData(
		/.*Apache Camel (?<camelVersion>\d+\.\d+\.\d+(|\.[a-zA-Z0-9-_]+)) \(CamelContext: .+\) started in.*/
	);
	analyzer.startOrderedParsing();

	const analyzerResult = await analyzer.wait() as RuntimeOutput;
	return analyzerResult;
}

function getExpectedNumberOfRoutes(args: TestArguments): number {
	switch (args.type) {
		case 'file':
			return 10;
		case 'url':
			return 2;
		default:
			expect.fail('Unsupported option');
			return -1;
	}
}

function getCamelContextPath(args: TestArguments): string {
	switch (args.framework) {
		case 'spring':
			return path.join('.', 'src', 'main', 'resources', 'META-INF', 'spring', 'camel-context.xml');
		case 'blueprint':
			return path.join('.', 'src', 'main', 'resources', 'OSGI-INF', 'blueprint', 'blueprint.xml');
		default:
			expect.fail('Unsupported option');
			return null;
	}
}

function getExpectedFileList(args: TestArguments): string[] {
	let files = [
		'wsdl2rest.readme.md',
		'config/logging.properties',
		getCamelContextPath(args)
	];

	let sourceRoot: string;
	let fileList: string[];
	switch (args.type) {
		case 'file':
			sourceRoot = path.join('.', 'src', 'main', 'java', 'org', 'jboss', 'fuse', 'wsdl2rest', 'test', 'doclit')
			fileList = [
				`AddAddress.java`,
				`AddAddressResponse.java`,
				`Address.java`,
				`AddressService.java`,
				`DelAddress.java`,
				`DelAddressResponse.java`,
				`GetAddress.java`,
				`GetAddressResponse.java`,
				`Item.java`,
				`ListAddresses.java`,
				`ListAddressesResponse.java`,
				`ObjectFactory.java`,
				`package-info.java`,
				`UpdAddress.java`,
				`UpdAddressResponse.java`,
			];
			break;
		case 'url':
			sourceRoot = path.join('.', 'src', 'main', 'java', 'org', 'helloworld', 'test', 'rpclit')
			fileList = [
				`HelloPortType.java`,
				`HelloService.java`,
			];
			break;
		default:
			expect.fail('Unsupported option');
			return null;
	}
	files.push(...fileList.map((file) => path.join(sourceRoot, file)));
	return files;
}

async function getInput(options?: InputOptions): Promise<Input> {
	const input = new Input();

	await input.getDriver().wait(async function () {
		try {
			const active = await input.isDisplayed() && await input.isEnabled();
			const placeholder = options?.placeholder ? options.placeholder(await input.getPlaceHolder()) : true;
			const message = options?.message ? options.message(await input.getMessage()) : true;
			const text = options?.text ? options.text(await input.getText()) : true;

			return active && placeholder && message && text;
		}
		catch {
			return false;
		}
	}, options?.timeout, `Input(text="${await input.getText()}", placeholder="${await input.getPlaceHolder()}", message="${await input.getMessage()}", active="${await input.isDisplayed() && await input.isEnabled()}")`);

	return input;
}

async function getQuickPicks(input: InputBox) {
	const quickPicks = await input.getQuickPicks();
	return Promise.all(quickPicks.map(async (q) => await q.getText()));
}

/**
 * Creates new project and opens it in vscode
 */
async function prepareWorkspace(timeout: number): Promise<Project> {
	Menu.defaultOpenMethod = OpenMethod.INPUT;

	const project = new Project(WORKSPACE_PATH);

	if (project.exists) {
		await project.delete();
	}

	await project.create();
	await project.open(timeout);
	return project;
}

/**
 * Closes and deletes project
 * @param workspace project object returned from `prepareWorkspace` function
 */
async function clearWorkspace(workspace: Project, timeout: number): Promise<void> {
	await workspace.close(timeout);
	await workspace.delete();
}

function timeout(ctx: Mocha.Context) {
	return ctx.timeout() - 2000;
}
