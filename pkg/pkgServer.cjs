// Entry of the pkg binary: Next.js's standalone `server.js` runs `process.chdir(__dirname)`, and pkg cannot change into its
// read-only `/snapshot` file system; Next.js gets its paths from `dir` anyway.
const chdir = process.chdir.bind(process);

process.chdir = (directory) => {
    try {
        chdir(directory);
    } catch (error) {
        if (!process.pkg) throw error;
    }
};

require('./server.js');
