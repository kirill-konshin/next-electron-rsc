import { wrapHandler } from '../lib';
import { IpcEvents } from 'next-pkg-common';

wrapHandler(IpcEvents.RANDOM, async (event, id) => Math.random());
