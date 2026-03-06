// The init command implementation now lives behind the installation capability.
// It still uses the same generic template flow built around `getAvailableTemplates`
// and `installTemplate`; this file is intentionally a thin command entrypoint.
export {default} from '../../capabilities/installation/control-plane/init-command.js'
