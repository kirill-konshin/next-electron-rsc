/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { defineYarnConfig } = require('@kirill.konshin/lint/yarn');

module.exports = defineConfig(defineYarnConfig());
