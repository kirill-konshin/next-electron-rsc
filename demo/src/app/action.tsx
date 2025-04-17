'use server';

export async function getFromServer() {
    return process.version;
}
