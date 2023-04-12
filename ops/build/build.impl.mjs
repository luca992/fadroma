import { execSync } from 'child_process'
import { resolve, dirname, sep } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const { argv, umask, chdir, cwd, exit } = process
const slashes = new RegExp("/", "g")
const dashes = new RegExp("-", "g")
const verbose = Boolean(env('_VERBOSE', false))
const phases = { phase1, phase2 }
const phase = argv[2]
const main = phases[phase]
main()

/** As the initial user, set up the container and the source workspace,
  * checking out an old commit if specified. Then, call phase 2 with
  * the name of each crate sequentially. */
function phase1 (options = {}) {
  let {
    tmpBuild    = env('_TMP_BUILD',  '/tmp/fadroma-build'),
    tmpTarget   = env('_TMP_TARGET', '/tmp/target'),
    tmpGit      = env('_TMP_GIT',    '/tmp/git'),
    registry    = env('_REGISTRY',   '/usr/local/cargo/registry'),
    subdir      = env('_SUBDIR',     '.') || '.',
    gitRoot     = env('_GIT_ROOT',   `/src/.git`),
    gitSubdir   = env('_GIT_SUBDIR', ''),
    gitRemote   = env('_GIT_REMOTE', 'origin'),
    uid         = env('_BUILD_UID',  1000),
    gid         = env('_BUILD_GID',  1000),
    noFetch     = env('_NO_FETCH',   false),
    docker      = env.RUNNING_IN_DOCKER || false, // are we running in a container?
    interpreter = argv[0],       // e.g. /usr/bin/node
    script      = argv[1],       // this file
    ref         = argv[3],       // "HEAD" | <git ref>
    crates      = argv.slice(4), // all crates to build
    user        = 'fadroma-builder',
    buildRoot   = resolve(tmpBuild, sanitize(ref)),
    gitDir      = resolve(gitRoot, gitSubdir),
  } = options
  log('Build phase 1: Preparing source repository for', ref)
  phase1_prepareContext()
  phase1_prepareSource()
  phase1_buildCrates()

  function phase1_prepareContext () {
    // The local registry is stored in a Docker volume mounted at /usr/local.
    // This makes sure it is accessible to non-root users.
    umask(0o000)
    if (buildRoot) run(`mkdir -p "${buildRoot}"`)
    if (tmpTarget) run(`mkdir -p "${tmpTarget}" && chmod -t "${tmpTarget}"`)
    if (registry)  run(`mkdir -p "${registry}"`)
    if (docker)    run(`chmod ugo+rwx /usr/local/cargo/registry`)
    umask(0o022)
  }

  function phase1_prepareSource () {
    // Copy the source into the build dir
    run(`git --version`)
    if (ref === 'HEAD') {
      log(`Building from working tree.`)
      chdir(subdir)
    } else {
      phase1_prepareHistory
    }
  }

  function phase1_prepareHistory () {
    log(`Building from checkout of ${ref}`)
    // This works by using ".git" (or ".git/modules/something") as a remote
    // and cloning from it. Since we may need to modify that directory,
    // we'll make a copy. This may be slow if ".git" is huge
    // (but at least it's not the entire working tree with node_modules etc)
    time(`cp -rT "${gitRoot}" "${tmpGit}"`)
    gitRoot = tmpGit
    gitDir  = resolve(gitRoot, gitSubdir)
    // Helper functions to run with ".git" in a non-default location.
    const gitRun  = command => run(`GIT_DIR=${gitDir} git ${command}`)
    const gitCall = command => call(`GIT_DIR=${gitDir} git ${command}`)
    // Make this a bare checkout by removing the path to the working tree from the config.
    // We can't use "config --local --unset core.worktree" - since the working tree path
    // does not exist, git command invocations fail with "no such file or directory".
    const gitConfigPath = resolve(gitDir, 'config')
    let gitConfig = readFileSync(gitConfigPath, 'utf8')
    gitConfig = gitConfig.replace(/\s+worktree.*/g, '')
    writeFileSync(gitConfigPath, gitConfig, 'utf8')
    try {
      // Make sure that .refs/heads/${ref} exists in the git history dir,
      // (it will exist if the branch has been previously checked out).
      // This is necessary to be able to clone that branch from the history dir -
      // "git clone" only looks in the repo's refs, not the repo's remotes' refs
      gitRun(`show-ref --verify --quiet refs/heads/${ref}`)
    } catch (e) {
      // If the branch is not checked out, but is fetched, do a "fake checkout":
      // create a ref under refs/heads pointing to that branch.
      if (noFetch) {
        console.error(`${ref} is not checked out or fetched. Run "git fetch" to update.`)
        exit(1)
      } else {
        try {
          console.warn(`\n${ref} is not checked out. Creating branch ref from ${gitRemote}/${ref}\n.`)
          gitRun(`fetch origin --recurse-submodules ${ref}`)
        } catch (e) {
          console.warn(`${ref}: failed to fetch: ${e.message}`)
        }
        const shown     = gitCall(`show-ref --verify refs/remotes/${gitRemote}/${ref}`)
        const remoteRef = shown.split(' ')[0]
        const refPath   = resolve(`${gitDir}/refs/heads/`, ref)
        mkdirSync(dirname(refPath), { recursive: true })
        writeFileSync(refPath, remoteRef, 'utf8')
        gitRun(`show-ref --verify --quiet refs/heads/${ref}`)
      }
    }
    // Clone from the temporary local remote into the temporary working tree
    run(`git clone --recursive -b ${ref} ${gitDir} ${buildRoot}`)
    chdir(buildRoot)
    // Report which commit we're building and what it looks like
    run(`git log -1`)
    if (verbose) run('pwd')
    if (verbose) run('ls -al')
    log()
    // Clone submodules
    log(`Populating Git submodules...`)
    run(`git submodule update --init --recursive`)
    chdir(subdir)
  }

  function phase1_buildCrates () {
    // Run phase 2 for each requested crate.
    // If not running as build user, switch to build user for each run of phase2.
    log(`\nBuilding in:`, call('pwd'))
    log(`Build phase 2 will run for these crates: ${crates}`)
    for (const crate of crates) {
      log(`\nBuilding ${crate} from ${ref} in ${cwd()}`)
      let phase2Command = `${interpreter} ${script} phase2 ${ref} ${crate}`
      if (process.getuid() != uid) {
        phase2Command = `sh -c "${phase2Command}"`
      }
      run(phase2Command)
    }
  }

}

/** As a non-root user, execute a release build, then optimize it with Binaryen. */
function phase2 (options = {}) {
  let {
    toolchain  = env('_TOOLCHAIN'),
    targetDir  = env('_TMP_TARGET', '/tmp/target'),
    ref        = argv[3], // "HEAD" | <git ref>
    crate      = argv[4], // one crate to build
    platform   = 'wasm32-unknown-unknown',
    locked     = '',
    output     = `${fumigate(crate)}.wasm`,
    releaseDir = resolve(targetDir, platform, 'release'),
    compiled   = resolve(releaseDir, output),
    outputDir  = env('_OUTPUT', '/output'),
    optimized  = resolve(outputDir, `${sanitize(crate)}@${sanitize(ref)}.wasm`),
    checksum   =  `${optimized}.sha256`,
  } = options
  log(`\nBuild phase 2: Compiling and optimizing contract: ${crate}@${ref}.wasm`)
  phase2_setupToolchain()
  phase2_reportContext()
  phase2_buildCrate()
  phase2_optimizeBinary()
  phase2_saveChecksum()
  return optimized

  function phase2_setupToolchain () {
    if (toolchain) {
      run(`rustup default ${toolchain}`)
      run(`rustup target add ${platform}`)
    }
    run(`rustup show active-toolchain`)
  }

  function phase2_reportContext () {
    // Print versions of used tools
    run(`cargo --version`)
    run(`rustc --version`)
    run(`wasm-opt --version`)
    run(`sha256sum --version | head -n1`)
    // In verbose mode, also "look around".
    if (verbose) {
      run(`pwd`)
      run(`ls -al`)
      run(`ls -al /tmp/target`)
    }
  }

  function phase2_buildCrate () {
    // Compile crate for production
    run(`cargo build -p ${crate} --release --target ${platform} ${locked} ${verbose?'--verbose':''}`, {
      CARGO_TARGET_DIR: targetDir,
      PLATFORM:         platform,
    })
    run(`tree ${targetDir}`)
  }

  function phase2_optimizeBinary () {
    // Output optimized build to artifacts directory
    if (verbose) run(`ls -al ${releaseDir}`)
    //run(`cp ${compiled} ${optimized}.unoptimized`)
    //run(`chmod -x ${optimized}.unoptimized`)
    if (verbose) {
      log(`WASM section headers of ${compiled}:`)
      run(`wasm-objdump -h ${compiled}`)
    }
    log(`Optimizing ${compiled} into ${optimized}...`)
    run(`wasm-opt -g -Oz --strip-dwarf ${compiled} -o ${optimized}`)
    if (verbose) {
      log(`* WASM section headers of ${optimized}:`)
      run(`wasm-objdump -h ${optimized}`)
    }
    log(`Optimization complete`)
  }

  function phase2_saveChecksum () {
    // Output checksum to artifacts directory
    log(`Saving checksum for ${optimized} into ${checksum}...`)
    run(`sha256sum -b ${optimized} > ${checksum}`)
    log(`Checksum calculated:`, checksum)
  }

}

function log (...args) {
  return console.log(...args)
}

function env (key, def) {
  let val = (key in process.env) ? process.env[key] : def
  if (val === '0')     val = 0
  if (val === 'false') val = false
  return val
}

function run (command, env2 = {}) {
  log('$', command)
  execSync(command, { env: { ...process.env, ...env2 }, stdio: 'inherit' })
}

function call (command) {
  log('$', command)
  const result = String(execSync(command)).trim()
  log(result)
  return result
}

function time (command) {
  const t0 = + new Date()
  run(command)
  const t1 = + new Date()
  log(`(took ${t1-t0}ms)`)
}

function sanitize (x) {
  return x.replace(slashes, "_")
}

function fumigate (x) {
  return x.replace(dashes,  "_")
}
