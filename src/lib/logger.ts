import log from 'loglevel';
import type { LoggingMethod, LogLevelDesc, MethodFactory } from 'loglevel';

const colors = {
	TRACE: '#888',
	DEBUG: '#1E88E5',
	INFO: '#43A047',
	WARN: '#FB8C00',
	ERROR: '#E53935'
};

const originalFactory = log.methodFactory;

const customFactory: MethodFactory = function (methodName, level, loggerName) {
	const rawMethod = originalFactory(methodName, level, loggerName);

	return function (...args: unknown[]) {
		const timestamp = new Date().toISOString();
		const color = colors[methodName.toUpperCase() as keyof typeof colors];

		// Format the message with timestamp and color
		const formattedArgs = [`%c[${timestamp}]`, `color:${color}`, ...args];

		// Add stack trace for errors
		if (methodName === 'error') {
			const stack = new Error().stack?.split('\n').slice(2).join('\n');
			if (stack) formattedArgs.push(`\n${stack}`);
		}

		rawMethod.apply(undefined, formattedArgs);
	};
};

log.methodFactory = customFactory;

// Reset logger to apply factory changes
const logger = log.getLogger('app');
log.setLevel(logger.getLevel() as LogLevelDesc);

if (import.meta.env.DEV) {
	logger.setLevel(log.levels.DEBUG);
} else {
	logger.setLevel(log.levels.WARN);
}

export default logger;
