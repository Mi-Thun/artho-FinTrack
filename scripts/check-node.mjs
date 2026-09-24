// Next 16 needs Node >= 20.9. On Node 14 the failure is a bare
// "SyntaxError: Unexpected token '??='" from deep inside a bundled dependency, which
// gives no clue what's actually wrong. This turns that into an actionable message.

const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 9;

const [major, minor] = process.versions.node.split(".").map(Number);
const tooOld = major < REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor < REQUIRED_MINOR);

if (tooOld) {
  const bold = (s) => `[1m${s}[0m`;
  const red = (s) => `[31m${s}[0m`;

  console.error(`
${red(bold("Node " + process.versions.node + " is too old for this project."))}

  Next.js 16 requires Node >= ${REQUIRED_MAJOR}.${REQUIRED_MINOR}. This repo pins ${bold("20.20.1")} in .nvmrc.

  ${bold("Fix:")}

    nvm use            ${bold("#")} reads .nvmrc
    nvm install        ${bold("#")} only if that version isn't installed yet

  To stop having to remember, make it automatic per-directory:

    echo 'cd() { builtin cd "$@" && [ -f .nvmrc ] && nvm use --silent; }' >> ~/.bashrc

  Or set it as your default:

    nvm alias default 20.20.1
`);
  process.exit(1);
}
