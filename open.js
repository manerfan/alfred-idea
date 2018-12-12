'use strict';

const execa = require('execa');

(async () => {
    const p = JSON.parse(process.argv[2]);

    await execa(p.appPath, [p.prjPath]);
    console.log(`opend ${p.prjName}`);
})()
