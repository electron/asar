import { platform } from 'os';

test.if = (condition: boolean) => (condition ? test : test.skip);
test.ifWindows = test.if(platform() === 'win32');
test.ifNotWindows = test.if(platform() !== 'win32');
