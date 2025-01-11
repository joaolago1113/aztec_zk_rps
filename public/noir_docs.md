---
title: Building a web app with Noir and Barretenberg
description: Learn how to setup a new app that uses Noir to generate and verify zero-knowledge SNARK proofs in a typescript or javascript environment.
keywords: [how to, guide, javascript, typescript, noir, barretenberg, zero-knowledge, proofs, app]
sidebar_position: 0
pagination_next: noir/concepts/data_types/index
---

NoirJS is a Typescript package meant to work both in a browser and a server environment.

In this tutorial, we will combine NoirJS with Aztec's Barretenberg backend to build a simple web app. From here, you should get an idea on how to proceed with your own Noir projects!

You can find the complete app code for this guide [here](https://github.com/noir-lang/tiny-noirjs-app).

## Dependencies

Before we start, we want to make sure we have Node installed. For convenience (and speed), we can just install [Bun](https://bun.sh) as our package manager, and Node will work out-of-the-box:

```bash
curl -fsSL https://bun.sh/install | bash
```

Let's go barebones. Doing the bare minimum is not only simple, but also allows you to easily adapt it to almost any frontend framework.

Barebones means we can immediately start with the dependencies even on an empty folder 😈:

```bash
bun i @noir-lang/noir_wasm@1.0.0-beta.0 @noir-lang/noir_js@1.0.0-beta.0 @aztec/bb.js@0.63.1
```

Wait, what are these dependencies?

- `noir_wasm` is the `wasm` version of the Noir compiler. Although most developers prefer to use `nargo` for compiling, there's nothing wrong with `noir_wasm`. We like `noir_wasm`.
- `noir_js` is the main Noir package. It will execute our program, and generate the witness that will be sent to the backend.
- `bb.js` is the Typescript interface for Aztec's Barretenberg proving backend. It also uses the `wasm` version in order to run on the browser.

:::info

In this guide, we will install versions pinned to 1.0.0-beta.0. These work with Barretenberg version 0.63.1, so we are using that one version too. Feel free to try with older or later versions, though!

:::

## Setting up our Noir program

ZK is a powerful technology. An app that reveals computational correctness but doesn't reveal some of its inputs is almost unbelievable, yet Noir makes it as easy as a single line of code.

:::tip

It's not just you. We also enjoy syntax highlighting. [Check out the Language Server](../tooling/language_server.md)

:::

All you need is a `main.nr` and a `Nargo.toml` file. You can follow the [noirup](../getting_started/noir_installation.md) installation and just run `noirup -v 1.0.0-beta.0`, or just create them by hand:

```bash
mkdir -p circuit/src
touch circuit/src/main.nr circuit/Nargo.toml
```

To make our program interesting, let's give it a real use-case scenario: Bob wants to prove he is older than 18, without disclosing his age. Open `main.nr` and write:

```rust
fn main(age: u8) {
  assert(age >= 18);
}
```

This program accepts a private input called age, and simply proves this number is higher than 18. But to run this code, we need to give the compiler a `Nargo.toml` with at least a name and a type:

```toml
[package]
name = "circuit"
type = "bin"
```

This is all that we need to get started with Noir.

![my heart is ready for you, noir.js](@site/static/img/memes/titanic.jpeg)

## Setting up our app

Remember when apps only had one `html` and one `js` file? Well, that's enough for Noir webapps. Let's create them:

```bash
touch index.html index.js
```

And add something useful to our HTML file:

```html
<!DOCTYPE html>
<head>
  <style>
    .outer {
        display: flex;
        justify-content: space-between;
        width: 100%;
    }
    .inner {
        width: 45%;
        border: 1px solid black;
        padding: 10px;
        word-wrap: break-word;
    }
  </style>
</head>
<body>
  <script type="module" src="/index.js"></script>
  <h1>Noir app</h1>
  <div class="input-area">
    <input id="age" type="number" placeholder="Enter age" />
    <button id="submit">Submit Age</button>
  </div>
  <div class="outer">
    <div id="logs" class="inner"><h2>Logs</h2></div>
    <div id="results" class="inner"><h2>Proof</h2></div>
  </div>
</body>
</html>
```

It _could_ be a beautiful UI... Depending on which universe you live in. In any case, we're using some scary CSS to make two boxes that will show cool things on the screen.

As for the JS, real madmen could just `console.log` everything, but let's say we want to see things happening (the true initial purpose of JS... right?). Here's some boilerplate for that. Just paste it in `index.js`:

```js
const show = (id, content) => {
 const container = document.getElementById(id);
 container.appendChild(document.createTextNode(content));
 container.appendChild(document.createElement("br"));
};

document.getElementById("submit").addEventListener("click", async () => {
 try {
  // noir goes here
 } catch {
  show("logs", "Oh 💔");
 }
});

```

:::info

At this point in the tutorial, your folder structure should look like this:

```tree
.
└── circuit
    └── src
           └── main.nr
        Nargo.toml
    index.js
    package.json
    index.html
    ...etc
```

:::

## Compile compile compile

Finally we're up for something cool. But before we can execute a Noir program, we need to compile it into ACIR: an abstract representation. Here's where `noir_wasm` comes in.

`noir_wasm` expects a filesystem so it can resolve dependencies. While we could use the `public` folder, let's just import those using the nice `?url` syntax provided by vite. At the top of the file:

```js
import { compile, createFileManager } from "@noir-lang/noir_wasm"

import main from "./circuit/src/main.nr?url";
import nargoToml from "./circuit/Nargo.toml?url";
```

Compiling on the browser is common enough that `createFileManager` already gives us a nice in-memory filesystem we can use. So all we need to compile is fetching these files, writing them to our filesystem, and compile. Add this function:

```js
export async function getCircuit() {
 const fm = createFileManager("/");
 const { body } = await fetch(main);
 const { body: nargoTomlBody } = await fetch(nargoToml);

 fm.writeFile("./src/main.nr", body);
 fm.writeFile("./Nargo.toml", nargoTomlBody);
 return await compile(fm);
}
```

:::tip

As you can imagine, with `node` it's all conveniently easier since you get native access to `fs`...

:::

## Some more JS

We're starting with the good stuff now. We want to execute our circuit to get the witness, and then feed that witness to Barretenberg. Luckily, both packages are quite easy to work with. Let's import them at the top of the file:

```js
import { UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
```

And instantiate them inside our try-catch block:

```ts
// try {
const { program } = await getCircuit();
const noir = new Noir(program);
const backend = new UltraHonkBackend(program.bytecode);
// }
```

:::warning

WASMs are not always easy to work with. In our case, `vite` likes serving them with the wrong MIME type. There are different fixes but we found the easiest one is just YOLO instantiating the WASMs manually. Paste this at the top of the file, just below the other imports, and it will work just fine:

```js
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
```

:::

## Executing and proving

Now for the app itself. We're capturing whatever is in the input when people press the submit button. Inside our `try` block, let's just grab that input and get its value. Noir will gladly execute it, and give us a witness:

```js
const age = document.getElementById("age").value;
show("logs", "Generating witness... ⏳");
const { witness } = await noir.execute({ age });
show("logs", "Generated witness... ✅");

```

:::note

For the remainder of the tutorial, everything will be happening inside the `try` block

:::

Now we're ready to prove stuff! Let's feed some inputs to our circuit and calculate the proof:

```js
show("logs", "Generating proof... ⏳");
const proof = await backend.generateProof(witness);
show("logs", "Generated proof... ✅");
show("results", proof.proof);
```

Our program is technically **done** . You're probably eager to see stuff happening! To serve this in a convenient way, we can use a bundler like `vite` by creating a `vite.config.js` file:

```bash
touch vite.config.js
```

`vite` helps us with a little catch: `bb.js` in particular uses top-level awaits which aren't supported everywhere. So we can add this to the `vite.config.js` to make the bundler optimize them:

```js
export default { optimizeDeps: { esbuildOptions: { target: "esnext" } } };
```

This should be enough for vite. We don't even need to install it, just run:

```bash
bunx vite
```

If it doesn't open a browser for you, just visit `localhost:5173`. You should now see the worst UI ever, with an ugly input.

![Noir Webapp UI](@site/static/img/tutorials/noirjs_webapp/webapp1.png)

Now, our circuit requires a private input `fn main(age: u8)`, and fails if it is less than 18. Let's see if it works. Submit any number above 18 (as long as it fits in 8 bits) and you should get a valid proof. Otherwise the proof won't even generate correctly.

By the way, if you're human, you shouldn't be able to understand anything on the "proof" box. That's OK. We like you, human ❤️.

## Verifying

Time to celebrate, yes! But we shouldn't trust machines so blindly. Let's add these lines to see our proof being verified:

```js
show('logs', 'Verifying proof... ⌛');
const isValid = await backend.verifyProof(proof);
show("logs", `Proof is ${isValid ? "valid" : "invalid"}... ✅`);
```

You have successfully generated a client-side Noir web app!

![coded app without math knowledge](@site/static/img/memes/flextape.jpeg)

## Next steps

At this point, you have a working ZK app that works on the browser. Actually, it works on a mobile phone too!

If you want to continue learning by doing, here are some challenges for you:

- Install [nargo](https://noir-lang.org/docs/getting_started/noir_installation) and write [Noir tests](../tooling/testing)
- Change the circuit to accept a [public input](../noir/concepts/data_types/#private--public-types) as the cutoff age. It could be different depending on the purpose, for example!
- Enjoy Noir's Rust-like syntax and write a struct `Country` that implements a trait `MinAge` with a method `get_min_age`. Then, make a struct `Person` have an `u8` as its age and a country of type `Country`. You can pass a `person` in JS just like a JSON object `person: { age, country: { min_age: 18 }}`

The world is your stage, just have fun with ZK! You can see how noirjs is used in a full stack Next.js hardhat application in the [noir-starter repo here](https://github.com/noir-lang/noir-starter/tree/main/vite-hardhat). The example shows how to calculate a proof in the browser and verify it with a deployed Solidity verifier contract from noirjs.

Check out other starters, tools, or just cool projects in the [awesome noir repository](https://github.com/noir-lang/awesome-noir).
---
title: How to use Oracles
description: Learn how to use oracles in your Noir program with examples in both Nargo and NoirJS. This guide also covers writing a JSON RPC server and providing custom foreign call handlers for NoirJS.
keywords:
  - Noir Programming
  - Oracles
  - Nargo
  - NoirJS
  - JSON RPC Server
  - Foreign Call Handlers
sidebar_position: 1
---

This guide shows you how to use oracles in your Noir program. For the sake of clarity, it assumes that:

- You have read the [explainer on Oracles](../explainers/explainer-oracle.md) and are comfortable with the concept.
- You have a Noir program to add oracles to. You can create one using the [vite-hardhat starter](https://github.com/noir-lang/noir-starter/tree/main/vite-hardhat) as a boilerplate.
- You understand the concept of a JSON-RPC server. Visit the [JSON-RPC website](https://www.jsonrpc.org/) if you need a refresher.
- You are comfortable with server-side JavaScript (e.g. Node.js, managing packages, etc.).

## Rundown

This guide has 3 major steps:

1. How to modify our Noir program to make use of oracle calls as unconstrained functions
2. How to write a JSON RPC Server to resolve these oracle calls with Nargo
3. How to use them in Nargo and how to provide a custom resolver in NoirJS

## Step 1 - Modify your Noir program

An oracle is defined in a Noir program by defining two methods:

- An unconstrained method - This tells the compiler that it is executing an [unconstrained function](../noir/concepts//unconstrained.md).
- A decorated oracle method - This tells the compiler that this method is an RPC call.

An example of an oracle that returns a `Field` would be:

```rust
#[oracle(getSqrt)]
unconstrained fn sqrt(number: Field) -> Field { }

unconstrained fn get_sqrt(number: Field) -> Field {
    sqrt(number)
}
```

In this example, we're wrapping our oracle function in an unconstrained method, and decorating it with `oracle(getSqrt)`. We can then call the unconstrained function as we would call any other function:

```rust
fn main(input: Field) {
    let sqrt = get_sqrt(input);
}
```

In the next section, we will make this `getSqrt` (defined on the `sqrt` decorator) be a method of the RPC server Noir will use.

:::danger

As explained in the [Oracle Explainer](../explainers/explainer-oracle.md), this `main` function is unsafe unless you constrain its return value. For example:

```rust
fn main(input: Field) {
    let sqrt = get_sqrt(input);
    assert(sqrt.pow_32(2) as u64 == input as u64); // <---- constrain the return of an oracle!
}
```

:::

:::info

Currently, oracles only work with single params or array params. For example:

```rust
#[oracle(getSqrt)]
unconstrained fn sqrt([Field; 2]) -> [Field; 2] { }
```

:::

## Step 2 - Write an RPC server

Brillig will call *one* RPC server. Most likely you will have to write your own, and you can do it in whatever language you prefer. In this guide, we will do it in Javascript.

Let's use the above example of an oracle that consumes an array with two `Field` and returns their square roots:

```rust
#[oracle(getSqrt)]
unconstrained fn sqrt(input: [Field; 2]) -> [Field; 2] { }

unconstrained fn get_sqrt(input: [Field; 2]) -> [Field; 2] {
    sqrt(input)
}

fn main(input: [Field; 2]) {
    let sqrt = get_sqrt(input);
    assert(sqrt[0].pow_32(2) as u64 == input[0] as u64);
    assert(sqrt[1].pow_32(2) as u64 == input[1] as u64);
}

#[test]
fn test() {
    let input = [4, 16];
    main(input);
}
```

:::info

Why square root?

In general, computing square roots is computationally more expensive than multiplications, which takes a toll when speaking about ZK applications. In this case, instead of calculating the square root in Noir, we are using our oracle to offload that computation to be made in plain. In our circuit we can simply multiply the two values.

:::

Now, we should write the correspondent RPC server, starting with the [default JSON-RPC 2.0 boilerplate](https://www.npmjs.com/package/json-rpc-2.0#example):

```js
import { JSONRPCServer } from "json-rpc-2.0";
import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const server = new JSONRPCServer();
app.post("/", (req, res) => {
 const jsonRPCRequest = req.body;
 server.receive(jsonRPCRequest).then((jsonRPCResponse) => {
  if (jsonRPCResponse) {
   res.json(jsonRPCResponse);
  } else {
   res.sendStatus(204);
  }
 });
});

app.listen(5555);
```

Now, we will add our `getSqrt` method, as expected by the `#[oracle(getSqrt)]` decorator in our Noir code. It maps through the params array and returns their square roots:

```js
server.addMethod("resolve_foreign_call", async (params) => {
    if (params[0].function !== "getSqrt") {
        throw Error("Unexpected foreign call")
    };
    const values = params[0].inputs[0].map((field) => {
        return `${Math.sqrt(parseInt(field, 16))}`;
    });
    return { values: [values] };
});
```

If you're using Typescript, the following types may be helpful in understanding the expected return value and making sure they're easy to follow:

```js
export type ForeignCallSingle = string;

export type ForeignCallArray = string[];

export type ForeignCallResult = {
  values: (ForeignCallSingle | ForeignCallArray)[];
};
```

:::info Multidimensional Arrays

If the Oracle function is returning an array containing other arrays, such as `[['1','2],['3','4']]`, you need to provide the values in JSON as flattened values. In the previous example, it would be `['1', '2', '3', '4']`. In the Noir program, the Oracle signature can use a nested type, the flattened values will be automatically converted to the nested type.

:::

## Step 3 - Usage with Nargo

Using the [`nargo` CLI tool](../reference/nargo_commands.md), you can use oracles in the `nargo test` and `nargo execute`  commands by passing a value to `--oracle-resolver`. For example:

```bash
nargo test --oracle-resolver http://localhost:5555
```

This tells `nargo` to use your RPC Server URL whenever it finds an oracle decorator.

## Step 4 - Usage with NoirJS

In a JS environment, an RPC server is not strictly necessary, as you may want to resolve your oracles without needing any JSON call at all. NoirJS simply expects that you pass a callback function when you generate proofs, and that callback function can be anything.

For example, if your Noir program expects the host machine to provide CPU pseudo-randomness, you could simply pass it as the `foreignCallHandler`. You don't strictly need to create an RPC server to serve pseudo-randomness, as you may as well get it directly in your app:

```js
const foreignCallHandler = (name, inputs) => crypto.randomBytes(16) // etc

await noir.execute(inputs, foreignCallHandler)
```

As one can see, in NoirJS, the [`foreignCallHandler`](../reference/NoirJS/noir_js/type-aliases/ForeignCallHandler.md) function simply means "a callback function that returns a value of type [`ForeignCallOutput`](../reference/NoirJS/noir_js/type-aliases/ForeignCallOutput.md). It doesn't have to be an RPC call like in the case for Nargo.

:::tip

Does this mean you don't have to write an RPC server like in [Step #2](#step-2---write-an-rpc-server)?

You don't technically have to, but then how would you run `nargo test`? To use both `Nargo` and `NoirJS` in your development flow, you will have to write a JSON RPC server.

:::

In this case, let's make `foreignCallHandler` call the JSON RPC Server we created in [Step #2](#step-2---write-an-rpc-server), by making it a JSON RPC Client.

For example, using the same `getSqrt` program in [Step #1](#step-1---modify-your-noir-program) (comments in the code):

```js
import { JSONRPCClient } from "json-rpc-2.0";

// declaring the JSONRPCClient
const client = new JSONRPCClient((jsonRPCRequest) => {
// hitting the same JSON RPC Server we coded above
 return fetch("http://localhost:5555", {
  method: "POST",
  headers: {
   "content-type": "application/json",
  },
  body: JSON.stringify(jsonRPCRequest),
 }).then((response) => {
  if (response.status === 200) {
   return response
    .json()
    .then((jsonRPCResponse) => client.receive(jsonRPCResponse));
  } else if (jsonRPCRequest.id !== undefined) {
   return Promise.reject(new Error(response.statusText));
  }
 });
});

// declaring a function that takes the name of the foreign call (getSqrt) and the inputs
const foreignCallHandler = async (name, input) => {
  const inputs = input[0].map((i) => i.toString("hex"))
  // notice that the "inputs" parameter contains *all* the inputs
  // in this case we to make the RPC request with the first parameter "numbers", which would be input[0]
  const oracleReturn = await client.request("resolve_foreign_call", [
    {
      function: name,
      inputs: [inputs]
    },
  ]);
  return [oracleReturn.values[0]];
};

// the rest of your NoirJS code
const input = { input: [4, 16] };
const { witness } = await noir.execute(input, foreignCallHandler);
```

:::tip

If you're in a NoirJS environment running your RPC server together with a frontend app, you'll probably hit a familiar problem in full-stack development: requests being blocked by [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) policy. For development only, you can simply install and use the [`cors` npm package](https://www.npmjs.com/package/cors) to get around the problem:

```bash
yarn add cors
```

and use it as a middleware:

```js
import cors from "cors";

const app = express();
app.use(cors())
```

:::

## Conclusion

Hopefully by the end of this guide, you should be able to:

- Write your own logic around Oracles and how to write a JSON RPC server to make them work with your Nargo commands.
- Provide custom foreign call handlers for NoirJS.
---
title: Generate a Solidity Verifier
description:
  Learn how to run the verifier as a smart contract on the blockchain. Compile a Solidity verifier
  contract for your Noir program and deploy it on any EVM blockchain acting as a verifier smart
  contract. Read more to find out
keywords:
  [
    solidity verifier,
    smart contract,
    blockchain,
    compiler,
    plonk_vk.sol,
    EVM blockchain,
    verifying Noir programs,
    proving backend,
    Barretenberg,
  ]
sidebar_position: 0
pagination_next: tutorials/noirjs_app
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

Noir is universal. The witness and the compiled program can be fed into a proving backend such as Aztec's [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg), which can then generate a verifier contract for deployment on blockchains.

This allows for a powerful feature set, as one can make use of the conciseness and the privacy provided by Noir in an immutable ledger. Applications can range from simple P2P guessing games, to complex private DeFi interactions.

Although not strictly in the domain of Noir itself, this guide shows how to generate a Solidity Verifier with Barretenberg and deploy it on the [Remix IDE](https://remix.ethereum.org/). It is assumed that:

- You will be using Barretenberg as your proving backend
- You will be using an EVM blockchain to verify your proof
- You are comfortable with the Solidity programming language and understand how contracts are deployed on the Ethereum network
- You have Noir installed and you have a Noir program. If you don't, [get started](../getting_started/quick_start.md) with Nargo and the example Hello Noir circuit
- You are comfortable navigating RemixIDE. If you aren't or you need a refresher, you can find some video tutorials [here](https://www.youtube.com/channel/UCjTUPyFEr2xDGN6Cg8nKDaA) that could help you.

## Rundown

Generating a Solidity Verifier with Barretenberg contract is actually a one-command process. However, compiling it and deploying it can have some caveats. Here's the rundown of this guide:

1. How to generate a solidity smart contract
2. How to compile the smart contract in the RemixIDE
3. How to deploy it to a testnet

:::info[Which proving system to use?]

Barretenberg currently provides two provers: `UltraPlonk` and `UltraHonk`. In a nutshell, `UltraHonk` is faster and uses less RAM, but its verifier contract is much more expensive. `UltraPlonk` is optimized for on-chain verification, but proving is more expensive.

In any case, we provide instructions for both. Choose your poison ☠️

:::

## Step 1 - Generate a contract

This is by far the most straightforward step. Just run:

```sh
nargo compile
```

This will compile your source code into a Noir build artifact to be stored in the `./target` directory. From here on, it's Barretenberg's work. You can generate the smart contract using the commands:

<Tabs>
<TabItem value="UltraHonk">

```sh
bb write_vk_ultra_keccak_honk -b ./target/<noir_artifact_name>.json
bb contract_ultra_honk
```

</TabItem>
<TabItem value="UltraPlonk">

```sh
bb write_vk -b ./target/<noir_artifact_name>.json
bb contract
```

</TabItem>
</Tabs>

replacing `<noir_artifact_name>` with the name of your Noir project. A `Verifier.sol` contract is now in the target folder and can be deployed to any EVM blockchain acting as a verifier smart contract.

You can find more information about `bb` and the default Noir proving backend on [this page](../getting_started/quick_start.md#proving-backend).


## Step 2 - Compiling

We will mostly skip the details of RemixIDE, as the UI can change from version to version. For now, we can just open
<a href="https://remix.ethereum.org" target="_blank">Remix</a> and create a blank workspace.

![Create Workspace](@site/static/img/how-tos/solidity_verifier_1.png)

We will create a new file to contain the contract Nargo generated, and copy-paste its content.

:::warning

You'll likely see a warning advising you to not trust pasted code. While it is an important warning, it is irrelevant in the context of this guide and can be ignored. We will not be deploying anywhere near a mainnet.

:::

To compile our the verifier, we can navigate to the compilation tab:

![Compilation Tab](@site/static/img/how-tos/solidity_verifier_2.png)

Remix should automatically match a suitable compiler version. However, hitting the "Compile" button will most likely tell you the contract is too big to deploy on mainnet, or complain about a stack too deep:

![Contract code too big](@site/static/img/how-tos/solidity_verifier_6.png)
![Stack too deep](@site/static/img/how-tos/solidity_verifier_8.png)

To avoid this, you can just use some optimization. Open the "Advanced Configurations" tab and enable optimization. The default 200 runs will suffice.

![Compilation success](@site/static/img/how-tos/solidity_verifier_4.png)

## Step 3 - Deploying

At this point we should have a compiled contract ready to deploy. If we navigate to the deploy section in Remix, we will see many different environments we can deploy to. The steps to deploy on each environment would be out-of-scope for this guide, so we will just use the default Remix VM.

Looking closely, we will notice that our "Solidity Verifier" is composed on multiple contracts working together. Remix will take care of the dependencies for us so we can simply deploy the Verifier contract by selecting it and hitting "deploy":

<Tabs>
<TabItem value="UltraHonk">

![Deploying HonkVerifier](@site/static/img/how-tos/solidity_verifier_7.png)

</TabItem>
<TabItem value="UltraPlonk">

![Deploying PlonkVerifier](@site/static/img/how-tos/solidity_verifier_9.png)

</TabItem>
</Tabs>

A contract will show up in the "Deployed Contracts" section.

## Step 4 - Verifying

To verify a proof using the Solidity verifier contract, we call the `verify` function:

```solidity
function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool)
```

First generate a proof with `bb`. We need a `Prover.toml` file for our inputs. Run:

```bash
nargo check
```

This will generate a `Prover.toml` you can fill with the values you want to prove. We can now execute the circuit with `nargo` and then use the proving backend to prove:

<Tabs>
<TabItem value="UltraHonk">

```bash
nargo execute <witness-name>
bb prove_ultra_keccak_honk -b ./target/<circuit-name>.json -w ./target/<witness-name> -o ./target/proof
```

:::tip[Public inputs]
Barretenberg attaches the public inputs to the proof, which in this case it's not very useful. If you're up for some JS, `bb.js` has [a method for it](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/ts/src/proof/index.ts), but in the CLI you can use this ugly snippet:

```bash
cat ./target/proof | od -An -v -t x1 | tr -d $' \n' | sed 's/^.\{8\}//' | (read hex; echo "${hex:0:192}${hex:256}")
```

Beautiful. This assumes a circuit with one public input (32 bytes, for Barretenberg). For more inputs, you can just increment `hex:256` with 32 more bytes for each public input.

:::

</TabItem>
<TabItem value="UltraPlonk">

```bash
nargo execute <witness-name>
bb prove -b ./target/<circuit-name>.json -w ./target/<witness-name> -o ./target/proof
```


:::tip[Public inputs]
Barretenberg attaches the public inputs to the proof, which in this case it's not very useful. If you're up for some JS, `bb.js` has [a method for it](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/ts/src/proof/index.ts), but in the CLI you can use this ugly snippet:

```bash
tail -c +33 ./target/proof | od -An -v -t x1 | tr -d $' \n'
```

Beautiful. This assumes a circuit with one public input (32 bytes, for Barretenberg). For more inputs, you can just add 32 more bytes for each public input to the `tail` command.

:::

</TabItem>
</Tabs>

Remix expects that the public inputs will be split into an array of `bytes32` values so `HEX_PUBLIC_INPUTS` needs to be split up into 32 byte chunks which are prefixed with `0x` accordingly.

A programmatic example of how the `verify` function is called can be seen in the example zk voting application [here](https://github.com/noir-lang/noir-examples/blob/33e598c257e2402ea3a6b68dd4c5ad492bce1b0a/foundry-voting/src/zkVote.sol#L35):

```solidity
function castVote(bytes calldata proof, uint proposalId, uint vote, bytes32 nullifierHash) public returns (bool) {
  // ...
  bytes32[] memory publicInputs = new bytes32[](4);
  publicInputs[0] = merkleRoot;
  publicInputs[1] = bytes32(proposalId);
  publicInputs[2] = bytes32(vote);
  publicInputs[3] = nullifierHash;
  require(verifier.verify(proof, publicInputs), "Invalid proof");
```

:::info[Return Values]

A circuit doesn't have the concept of a return value. Return values are just syntactic sugar in Noir.

Under the hood, the return value is passed as an input to the circuit and is checked at the end of the circuit program.

For example, if you have Noir program like this:

```rust
fn main(
    // Public inputs
    pubkey_x: pub Field,
    pubkey_y: pub Field,
    // Private inputs
    priv_key: Field,
) -> pub Field
```

the `verify` function will expect the public inputs array (second function parameter) to be of length 3, the two inputs and the return value.

Passing only two inputs will result in an error such as `PUBLIC_INPUT_COUNT_INVALID(3, 2)`.

In this case, the inputs parameter to `verify` would be an array ordered as `[pubkey_x, pubkey_y, return]`.

:::

:::tip[Structs]

You can pass structs to the verifier contract. They will be flattened so that the array of inputs is 1-dimensional array.

For example, consider the following program:

```rust
struct Type1 {
  val1: Field,
  val2: Field,
}

struct Nested {
  t1: Type1,
  is_true: bool,
}

fn main(x: pub Field, nested: pub Nested, y: pub Field) {
  //...
}
```

The order of these inputs would be flattened to: `[x, nested.t1.val1, nested.t1.val2, nested.is_true, y]`

:::

The other function you can call is our entrypoint `verify` function, as defined above.

:::tip

It's worth noticing that the `verify` function is actually a `view` function. A `view` function does not alter the blockchain state, so it doesn't need to be distributed (i.e. it will run only on the executing node), and therefore doesn't cost any gas.

This can be particularly useful in some situations. If Alice generated a proof and wants Bob to verify its correctness, Bob doesn't need to run Nargo, NoirJS, or any Noir specific infrastructure. He can simply make a call to the blockchain with the proof and verify it is correct without paying any gas.

It would be incorrect to say that a Noir proof verification costs any gas at all. However, most of the time the result of `verify` is used to modify state (for example, to update a balance, a game state, etc). In that case the whole network needs to execute it, which does incur gas costs (calldata and execution, but not storage).

:::

## A Note on EVM chains

Noir proof verification requires the ecMul, ecAdd and ecPairing precompiles. Not all EVM chains support EC Pairings, notably some of the ZK-EVMs. This means that you won't be able to use the verifier contract in all of them. You can find an incomplete list of which EVM chains support these precompiles [here](https://www.evmdiff.com/features?feature=precompiles).

For example, chains like `zkSync ERA` and `Polygon zkEVM` do not currently support these precompiles, so proof verification via Solidity verifier contracts won't work. Here's a quick list of EVM chains that have been tested and are known to work:

- Optimism
- Arbitrum
- Polygon PoS
- Scroll
- Celo
- BSC
- Blast L2
- Avalanche C-Chain
- Mode
- Linea
- Moonbeam

If you test any other chains, please open a PR on this page to update the list. See [this doc](https://github.com/noir-lang/noir-starter/tree/main/with-foundry#testing-on-chain) for more info about testing verifier contracts on different EVM chains.

## What's next

Now that you know how to call a Noir Solidity Verifier on a smart contract using Remix, you should be comfortable with using it with some programmatic frameworks, such as [hardhat](https://github.com/noir-lang/noir-starter/tree/main/vite-hardhat) and [foundry](https://github.com/noir-lang/noir-starter/tree/main/with-foundry).

You can find other tools, examples, boilerplates and libraries in the [awesome-noir](https://github.com/noir-lang/awesome-noir) repository.

You should also be ready to write and deploy your first NoirJS app and start generating proofs on websites, phones, and NodeJS environments! Head on to the [NoirJS tutorial](../tutorials/noirjs_app.md) to learn how to do that.
---
title: Developer Containers and Codespaces
description: "Learn how to set up a devcontainer in your GitHub repository for a seamless coding experience with Codespaces. Follow our easy 8-step guide to create your own Noir environment without installing Nargo locally."
keywords: ["Devcontainer", "Codespaces", "GitHub", "Noir Environment", "Docker Image", "Development Environment", "Remote Coding", "GitHub Codespaces", "Noir Programming", "Nargo", "VSCode Extensions", "Noirup"]
sidebar_position: 1
---

Adding a developer container configuration file to your Noir project is one of the easiest way to unlock coding in browser.

## What's a devcontainer after all?

A [Developer Container](https://containers.dev/) (devcontainer for short) is a Docker image that comes preloaded with tools, extensions, and other tools you need to quickly get started or continue a project, without having to install Nargo locally. Think of it as a development environment in a box.

There are many advantages to this:

- It's platform and architecture agnostic
- You don't need to have an IDE installed, or Nargo, or use a terminal at all
- It's safer for using on a public machine or public network

One of the best ways of using devcontainers is... not using your machine at all, for maximum control, performance, and ease of use.
Enter Codespaces.

## Codespaces

If a devcontainer is just a Docker image, then what stops you from provisioning a `p3dn.24xlarge` AWS EC2 instance with 92 vCPUs and 768 GiB RAM and using it to prove your 10-gate SNARK proof? 

Nothing! Except perhaps the 30-40$ per hour it will cost you. 

The problem is that provisioning takes time, and I bet you don't want to see the AWS console every time you want to code something real quick.

Fortunately, there's an easy and free way to get a decent remote machine ready and loaded in less than 2 minutes: Codespaces. [Codespaces is a Github feature](https://github.com/features/codespaces) that allows you to code in a remote machine by using devcontainers, and it's pretty cool:

- You can start coding Noir in less than a minute
- It uses the resources of a remote machine, so you can code on your grandma's phone if needed be
- It makes it easy to share work with your frens
- It's fully reusable, you can stop and restart whenever you need to

:::info

Don't take out your wallet just yet. Free GitHub accounts get about [15-60 hours of coding](https://github.com/features/codespaces) for free per month, depending on the size of your provisioned machine.

:::

## Tell me it's _actually_ easy

It is!

Github comes with a default codespace and you can use it to code your own devcontainer. That's exactly what we will be doing in this guide.

<video width="100%" height="auto" controls>
  <source src={require('@site/static/video/how-tos/devcontainer.mp4').default} type="video/mp4" />
  Your browser does not support the video tag.
</video>

8 simple steps:

#### 1. <a href="https://github.com/new" target="_blank">Create a new repository</a> on GitHub.

#### 2. Click "Start coding with Codespaces". This will use the default image.

#### 3. Create a folder called `.devcontainer` in the root of your repository.

#### 4. Create a Dockerfile in that folder, and paste the following code:

```docker
FROM --platform=linux/amd64 node:lts-bookworm-slim
SHELL ["/bin/bash", "-c"]
RUN apt update && apt install -y curl bash git tar gzip libc++-dev
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:$PATH"
RUN noirup
ENTRYPOINT ["nargo"]
```
#### 5. Create a file called `devcontainer.json` in the same folder, and paste the following code:

```json
{
 "name": "Noir on Codespaces",
 "build": {
    "context": ".",
    "dockerfile": "Dockerfile"
  },
  "customizations": {
    "vscode": {
      "extensions": ["noir-lang.vscode-noir"]
    }
  }
}
```
#### 6. Commit and push your changes

This will pull the new image and build it, so it could take a minute or so

#### 8. Done! 
Just wait for the build to finish, and there's your easy Noir environment.


Refer to [noir-starter](https://github.com/noir-lang/noir-starter/) as an example of how devcontainers can be used together with codespaces.



## How do I use it?

Using the codespace is obviously much easier than setting it up. 
Just navigate to your repository and click "Code" -> "Open with Codespaces". It should take a few seconds to load, and you're ready to go.

:::info

If you really like the experience, you can add a badge to your readme, links to existing codespaces, and more. 
Check out the [official docs](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/setting-up-your-repository/facilitating-quick-creation-and-resumption-of-codespaces) for more info.
---
title: Prove Merkle Tree Membership
description:
  Learn how to use merkle membership proof in Noir to prove that a given leaf is a member of a
  merkle tree with a specified root, at a given index.
keywords:
  [merkle proof, merkle membership proof, Noir, rust, hash function, Pedersen, sha256, merkle tree]
sidebar_position: 4
---

Let's walk through an example of a merkle membership proof in Noir that proves that a given leaf is
in a merkle tree.

```rust

fn main(message : [Field; 62], index : Field, hashpath : [Field; 40], root : Field) {
    let leaf = std::hash::hash_to_field(message.as_slice());
    let merkle_root = std::merkle::compute_merkle_root(leaf, index, hashpath);
    assert(merkle_root == root);
}

```

The message is hashed using `hash_to_field`. The specific hash function that is being used is chosen
by the backend. The only requirement is that this hash function can heuristically be used as a
random oracle. If only collision resistance is needed, then one can call `std::hash::pedersen_hash`
instead.

```rust
let leaf = std::hash::hash_to_field(message.as_slice());
```

The leaf is then passed to a compute_merkle_root function with the root, index and hashpath. The returned root can then be asserted to be the same as the provided root.

```rust
let merkle_root = std::merkle::compute_merkle_root(leaf, index, hashpath);
assert (merkle_root == root);
```

> **Note:** It is possible to re-implement the merkle tree implementation without standard library.
> However, for most usecases, it is enough. In general, the standard library will always opt to be
> as conservative as possible, while striking a balance with efficiency.

An example, the merkle membership proof, only requires a hash function that has collision
resistance, hence a hash function like Pedersen is allowed, which in most cases is more efficient
than the even more conservative sha256.

[View an example on the starter repo](https://github.com/noir-lang/noir-examples/blob/3ea09545cabfa464124ec2f3ea8e60c608abe6df/stealthdrop/circuits/src/main.nr#L20)
---
title: How to use recursion on NoirJS
description: Learn how to implement recursion with NoirJS, a powerful tool for creating smart contracts on the EVM blockchain. This guide assumes familiarity with NoirJS, solidity verifiers, and the Barretenberg proving backend. Discover how to generate both final and intermediate proofs using `noir_js` and `bb.js`.
keywords:
  [
    "NoirJS",
    "EVM blockchain",
    "smart contracts",
    "recursion",
    "solidity verifiers",
    "Barretenberg backend",
    "noir_js",
    "intermediate proofs",
    "final proofs",
    "nargo compile",
    "json import",
    "recursive circuit",
    "recursive app"
  ]
sidebar_position: 1
---

This guide shows you how to use recursive proofs in your NoirJS app. For the sake of clarity, it is assumed that:

- You already have a NoirJS app. If you don't, please visit the [NoirJS tutorial](../tutorials/noirjs_app.md) and the [reference](../reference/NoirJS/noir_js/index.md).
- You are familiar with what are recursive proofs and you have read the [recursion explainer](../explainers/explainer-recursion.md)
- You already built a recursive circuit following [the reference](../noir/standard_library/recursion.mdx), and understand how it works.

It is also assumed that you're not using `noir_wasm` for compilation, and instead you've used [`nargo compile`](../reference/nargo_commands.md) to generate the `json` you're now importing into your project. However, the guide should work just the same if you're using `noir_wasm`.

:::info

As you've read in the [explainer](../explainers/explainer-recursion.md), a recursive proof is an intermediate proof. This means that it doesn't necessarily generate the final step that makes it verifiable in a smart contract. However, it is easy to verify within another circuit.

:::

In a standard recursive app, you're also dealing with at least two circuits. For the purpose of this guide, we will assume the following:

- `main`: a circuit of type `assert(x != y)`, which we want to embed in another circuit recursively. For example when proving with the `bb` tool, we can use the `--recursive` CLI option to tell the backend that it should generate proofs that are friendly for verification within another circuit.
- `recursive`: a circuit that verifies `main`

For a full example of how recursive proofs work, please refer to the [noir-examples](https://github.com/noir-lang/noir-examples) repository. We will *not* be using it as a reference for this guide.

## Step 1: Setup

In a common NoirJS app, you need to instantiate a backend with something like `const backend = new Backend(circuit)`. Then you feed it to the `noir_js` interface.

For recursion, this doesn't happen, and the only need for `noir_js` is only to `execute` a circuit and get its witness and return value. Everything else is not interfaced, so it needs to happen on the `backend` object.

It is also recommended that you instantiate the backend with as many threads as possible, to allow for maximum concurrency:

```js
const backend = new UltraPlonkBackend(circuit, { threads: 8 }, { recursive: true })
```

:::tip
You can use the [`os.cpus()`](https://nodejs.org/api/os.html#oscpus) object in `nodejs` or [`navigator.hardwareConcurrency`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency) on the browser to make the most out of those glorious cpu cores
:::

## Step 2: Generating the witness and the proof for `main`

After instantiating the backend, you should also instantiate `noir_js`. We will use it to execute the circuit and get the witness.

```js
const noir = new Noir(circuit)
const { witness } = noir.execute(input)
```

With this witness, you are now able to generate the intermediate proof for the main circuit:

```js
const { proof, publicInputs } = await backend.generateProof(witness)
```

:::warning

Always keep in mind what is actually happening on your development process, otherwise you'll quickly become confused about what circuit we are actually running and why!

In this case, you can imagine that Alice (running the `main` circuit) is proving something to Bob (running the `recursive` circuit), and Bob is verifying her proof within his proof.

With this in mind, it becomes clear that our intermediate proof is the one *meant to be verified within another circuit*, so it must be Alice's. Actually, the only final proof in this theoretical scenario would be the last one, sent on-chain.

:::

## Step 3 - Verification and proof artifacts

Optionally, you are able to verify the intermediate proof:

```js
const verified = await backend.verifyProof({ proof, publicInputs })
```

This can be useful to make sure our intermediate proof was correctly generated. But the real goal is to do it within another circuit. For that, we need to generate  recursive proof artifacts that will be passed to the circuit that is verifying the proof we just generated. Instead of passing the proof and verification key as a byte array, we pass them as fields which makes it cheaper to verify in a circuit:

```js
const { proofAsFields, vkAsFields, vkHash } = await backend.generateRecursiveProofArtifacts( { publicInputs, proof }, publicInputsCount)
```

This call takes the public inputs and the proof, but also the public inputs count. While this is easily retrievable by simply counting the `publicInputs` length, the backend interface doesn't currently abstract it away.

:::info

The `proofAsFields` has a constant size `[Field; 93]` and verification keys in Barretenberg are always `[Field; 114]`.

:::

:::warning

One common mistake is to forget *who* makes this call.

In a situation where Alice is generating the `main` proof, if she generates the proof artifacts and sends them to Bob, which gladly takes them as true, this would mean Alice could prove anything!

Instead, Bob needs to make sure *he* extracts the proof artifacts, using his own instance of the `main` circuit backend. This way, Alice has to provide a valid proof for the correct `main` circuit.

:::

## Step 4 - Recursive proof generation

With the artifacts, generating a recursive proof is no different from a normal proof. You simply use the `backend` (with the recursive circuit) to generate it:

```js
const recursiveInputs = {
    verification_key: vkAsFields, // array of length 114
    proof: proofAsFields, // array of length 93 + size of public inputs
    publicInputs: [mainInput.y], // using the example above, where `y` is the only public input
    key_hash: vkHash,
}

const { witness, returnValue } = noir.execute(recursiveInputs) // we're executing the recursive circuit now!
const { proof, publicInputs } = backend.generateProof(witness)
const verified = backend.verifyProof({ proof, publicInputs })
```

You can obviously chain this proof into another proof. In fact, if you're using recursive proofs, you're probably interested of using them this way!

:::tip

Managing circuits and "who does what" can be confusing. To make sure your naming is consistent, you can keep them in an object. For example:

```js
const circuits = {
  main: mainJSON,
  recursive: recursiveJSON
}
const backends = {
  main: new BarretenbergBackend(circuits.main),
  recursive: new BarretenbergBackend(circuits.recursive)
}
const noir_programs = {
  main: new Noir(circuits.main),
  recursive: new Noir(circuits.recursive)
}
```

This allows you to neatly call exactly the method you want without conflicting names:

```js
// Alice runs this 👇
const { witness: mainWitness } = await noir_programs.main.execute(input)
const proof = await backends.main.generateProof(mainWitness)

// Bob runs this 👇
const verified = await backends.main.verifyProof(proof)
const { proofAsFields, vkAsFields, vkHash } = await backends.main.generateRecursiveProofArtifacts(
    proof,
    numPublicInputs,
);
const { witness: recursiveWitness } = await noir_programs.recursive.execute(recursiveInputs)
const recursiveProof = await backends.recursive.generateProof(recursiveWitness);
```

:::
---
title: Using the VS Code Debugger
description:
  Step-by-step guide on how to debug your Noir circuits with the VS Code Debugger configuration and features.
keywords:
  [
    Nargo,
    Noir CLI,
    Noir Debugger,
    VS Code,
    IDE,
  ]
sidebar_position: 0
---

This guide will show you how to use VS Code with the vscode-noir extension to debug a Noir project. 

#### Pre-requisites

- Nargo
- vscode-noir
- A Noir project with a `Nargo.toml`, `Prover.toml` and at least one Noir (`.nr`) containing an entry point function (typically `main`).

## Running the debugger

The easiest way to start debugging is to open the file you want to debug, and press `F5`. This will cause the debugger to launch, using your `Prover.toml` file as input.

You should see something like this:

![Debugger launched](@site/static/img/debugger/1-started.png)

Let's inspect the state of the program. For that, we open VS Code's _Debug pane_. Look for this icon:

![Debug pane icon](@site/static/img/debugger/2-icon.png)

You will now see two categories of variables: Locals and Witness Map.

![Debug pane expanded](@site/static/img/debugger/3-debug-pane.png)

1. **Locals**: variables of your program. At this point in execution this section is empty, but as we step through the code it will get populated by `x`, `result`, `digest`, etc. 

2. **Witness map**: these are initially populated from your project's `Prover.toml` file. In this example, they will be used to populate `x` and `result` at the beginning of the `main` function.

Most of the time you will probably be focusing mostly on locals, as they represent the high level state of your program. 

You might be interested in inspecting the witness map in case you are trying to solve a really low level issue in the compiler or runtime itself, so this concerns mostly advanced or niche users.

Let's step through the program, by using the debugger buttons or their corresponding keyboard shortcuts.

![Debugger buttons](@site/static/img/debugger/4-debugger-buttons.png)

Now we can see in the variables pane that there's values for `digest`, `result` and `x`.

![Inspecting locals](@site/static/img/debugger/5-assert.png)

We can also inspect the values of variables by directly hovering on them on the code.

![Hover locals](@site/static/img/debugger/6-hover.png)

Let's set a break point at the `keccak256` function, so we can continue execution up to the point when it's first invoked without having to go one step at a time. 

We just need to click the to the right of the line number 18. Once the breakpoint appears, we can click the `continue` button or use its corresponding keyboard shortcut (`F5` by default).

![Breakpoint](@site/static/img/debugger/7-break.png)

Now we are debugging the `keccak256` function, notice the _Call Stack pane_ at the lower right. This lets us inspect the current call stack of our process.

That covers most of the current debugger functionalities. Check out [the reference](../../reference/debugger/debugger_vscode.md) for more details on how to configure the debugger.
---
title: Using the REPL Debugger
description:
  Step-by-step guide on how to debug your Noir circuits with the REPL Debugger. 
keywords:
  [
    Nargo,
    Noir CLI,
    Noir Debugger,
    REPL,
  ]
sidebar_position: 1
---

#### Pre-requisites

In order to use the REPL debugger, first you need to install recent enough versions of Nargo and vscode-noir. 

## Debugging a simple circuit

Let's debug a simple circuit:

```rust
fn main(x : Field, y : pub Field) {
    assert(x != y);
}
```

To start the REPL debugger, using a terminal, go to a Noir circuit's home directory. Then:

`$ nargo debug`

You should be seeing this in your terminal:

```
[main] Starting debugger
At ~/noir-examples/recursion/circuits/main/src/main.nr:1:9
  1 -> fn main(x : Field, y : pub Field) {
  2        assert(x != y);
  3    }
> 
```

The debugger displays the current Noir code location, and it is now waiting for us to drive it.

Let's first take a look at the available commands. For that we'll use the `help` command.

```
> help
Available commands:

  opcodes                          display ACIR opcodes
  into                             step into to the next opcode
  next                             step until a new source location is reached
  out                              step until a new source location is reached
                                   and the current stack frame is finished
  break LOCATION:OpcodeLocation    add a breakpoint at an opcode location
  over                             step until a new source location is reached
                                   without diving into function calls
  restart                          restart the debugging session
  delete LOCATION:OpcodeLocation   delete breakpoint at an opcode location
  witness                          show witness map
  witness index:u32                display a single witness from the witness map
  witness index:u32 value:String   update a witness with the given value
  memset index:usize value:String  update a memory cell with the given
                                   value
  continue                         continue execution until the end of the
                                   program
  vars                             show variable values available at this point
                                   in execution
  stacktrace                       display the current stack trace
  memory                           show memory (valid when executing unconstrained code)
  step                             step to the next ACIR opcode

Other commands:

  help  Show this help message
  quit  Quit repl

```

Some commands operate only for unconstrained functions, such as `memory` and `memset`. If you try to use them while execution is paused at an ACIR opcode, the debugger will simply inform you that you are not executing unconstrained code:

```
> memory
Unconstrained VM memory not available
> 
```

Before continuing, we can take a look at the initial witness map:

```
> witness
_0 = 1
_1 = 2
>
```

Cool, since `x==1`, `y==2`, and we want to check that `x != y`, our circuit should succeed. At this point we could intervene and use the witness setter command to change one of the witnesses. Let's set `y=3`, then back to 2, so we don't affect the expected result:

```
> witness
_0 = 1
_1 = 2
> witness 1 3
_1 = 3
> witness
_0 = 1
_1 = 3
> witness 1 2
_1 = 2
> witness
_0 = 1
_1 = 2
>
```

Now we can inspect the current state of local variables. For that we use the `vars` command. 

```
> vars
>
```

We currently have no vars in context, since we are at the entry point of the program. Let's use `next` to execute until the next point in the program.

```
> vars
> next
At ~/noir-examples/recursion/circuits/main/src/main.nr:1:20
  1 -> fn main(x : Field, y : pub Field) {
  2        assert(x != y);
  3    }
> vars
x:Field = 0x01
```

As a result of stepping, the variable `x`, whose initial value comes from the witness map, is now in context and returned by `vars`.

```
> next
  1    fn main(x : Field, y : pub Field) {
  2 ->     assert(x != y);
  3    }
> vars
y:Field = 0x02
x:Field = 0x01
```

Stepping again we can finally see both variables and their values. And now we can see that the next assertion should succeed.

Let's continue to the end:

```
> continue
(Continuing execution...)
Finished execution
> q
[main] Circuit witness successfully solved
```

Upon quitting the debugger after a solved circuit, the resulting circuit witness gets saved, equivalent to what would happen if we had run the same circuit with `nargo execute`.

We just went through the basics of debugging using Noir REPL debugger. For a comprehensive reference, check out [the reference page](../../reference/debugger/debugger_repl.md).
---
title: Noir Lang
hide_title: true
description:
  Learn about the public alpha release of Noir, a domain specific language heavily influenced by Rust that compiles to
  an intermediate language which can be compiled to an arithmetic circuit or a rank-1 constraint system.
keywords:
    [Noir,
    Domain Specific Language,
    Rust,
    Intermediate Language,
    Arithmetic Circuit,
    Rank-1 Constraint System,
    Ethereum Developers,
    Protocol Developers,
    Blockchain Developers,
    Proving System,
    Smart Contract Language]
sidebar_position: 0
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import ThemedImage from '@theme/ThemedImage';
import useBaseUrl from '@docusaurus/useBaseUrl';

<ThemedImage
  sources={{
    light: useBaseUrl("/img/logoDark.png"),
    dark: useBaseUrl("/img/logo.png"),
  }}
  style={{display: "block", width: "50%", margin: "2rem auto"}} 
  alt="Noir Logo" 
/>

Noir is an open-source Domain-Specific Language for safe and seamless construction of privacy-preserving Zero-Knowledge programs, requiring no previous knowledge on the underlying mathematics or cryptography.

ZK programs are programs that can generate short proofs of statements without revealing all inputs to the statements. You can read more about Zero-Knowledge Proofs [here](https://dev.to/spalladino/a-beginners-intro-to-coding-zero-knowledge-proofs-c56).

## What's new about Noir?

Noir works differently from most ZK languages by taking a two-pronged path. First, it compiles the program to an adaptable intermediate language known as ACIR. From there, depending on a given project's needs, ACIR can be further compiled into an arithmetic circuit for integration with the proving backend.

:::info

Noir is backend agnostic, which means it makes no assumptions on which proving backend powers the ZK proof. Being the language that powers [Aztec Contracts](https://docs.aztec.network/developers/contracts/main), it defaults to Aztec's Barretenberg proving backend.

However, the ACIR output can be transformed to be compatible with other PLONK-based backends, or into a [rank-1 constraint system](https://www.rareskills.io/post/rank-1-constraint-system) suitable for backends such as Arkwork's Marlin.

:::

## Who is Noir for?

Noir can be used both in complex cloud-based backends and in user's smartphones, requiring no knowledge on the underlying math or cryptography. From authorization systems that keep a password in the user's device, to complex on-chain verification of recursive proofs, Noir is designed to abstract away complexity without any significant overhead. Here are some examples of situations where Noir can be used:

<Tabs>
  <TabItem value="Aztec Contracts" label="Aztec Contracts" default>
    <img src={require("@site/static/img/aztec_logo.png").default} style={{display: "block", width: "50%", margin: "2rem auto"}} alt="Noir Logo"  />
    
    Aztec Contracts leverage Noir to allow for the storage and execution of private information. Writing an Aztec Contract is as easy as writing Noir, and Aztec developers can easily interact with the network storage and execution through the [Aztec.nr](https://docs.aztec.network/developers/contracts/main) library.
  </TabItem>
  <TabItem value="Solidity Verifiers" label="Solidity Verifiers">
    <img src={require("@site/static/img/solidity_verifier_ex.png").default} style={{display: "block", margin: "2rem auto"}} alt="Soliditry Verifier Example"  />
    Noir can auto-generate Solidity verifier contracts that verify Noir proofs. This allows for non-interactive verification of proofs containing private information in an immutable system. This feature powers a multitude of use-case scenarios, from P2P chess tournaments, to [Aztec Layer-2 Blockchain](https://docs.aztec.network/)
  </TabItem>
  <TabItem value="Full-Stack Development" label="Full-Stack Development">
    Aztec Labs developed NoirJS, an easy interface to generate and verify Noir proofs in a Javascript environment. This allows for Noir to be used in webpages, mobile apps, games, and any other environment supporting JS execution in a standalone manner.
  </TabItem>
</Tabs>


## Libraries

Noir is meant to be easy to extend by simply importing Noir libraries just like in Rust. 
The [awesome-noir repo](https://github.com/noir-lang/awesome-noir#libraries) is a collection of libraries developed by the Noir community.
Writing a new library is easy and makes code be composable and easy to reuse. See the section on [dependencies](noir/modules_packages_crates/dependencies.md) for more information.
---
title: Noir Codegen for TypeScript
description: Learn how to use Noir codegen to generate TypeScript bindings 
keywords: [Nargo, Noir, compile, TypeScript]
sidebar_position: 3
---

When using TypeScript, it is extra work to interpret Noir program outputs in a type-safe way. Third party libraries may exist for popular Noir programs, but they are either hard to find or unmaintained.

Now you can generate TypeScript bindings for your Noir programs in two steps:

1. Exporting Noir functions using `nargo export`
2. Using the TypeScript module `noir_codegen` to generate TypeScript binding

**Note:** you can only export functions from a Noir *library* (not binary or contract program types).

## Installation

### Your TypeScript project

If you don't already have a TypeScript project you can add the module with `yarn` (or `npm`), then initialize it:

```bash
yarn add typescript -D
npx tsc --init
```

### Add TypeScript module - `noir_codegen`

The following command will add the module to your project's devDependencies:

```bash
yarn add @noir-lang/noir_codegen -D
```

### Nargo library

Make sure you have Nargo, v0.25.0 or greater, installed. If you don't, follow the [installation guide](../getting_started/noir_installation.md).

If you're in a new project, make a `circuits` folder and create a new Noir library:

```bash
mkdir circuits && cd circuits
nargo new --lib myNoirLib
```

## Usage

### Export ABI of specified functions

First go to the `.nr` files in your Noir library, and add the `#[export]` macro to each function that you want to use in TypeScript.

```rust
#[export]
fn your_function(...
```

From your Noir library (where `Nargo.toml` is), run the following command:

```bash
nargo export
```

You will now have an `export` directory with a .json file per exported function.

You can also specify the directory of Noir programs using `--program-dir`, for example:

```bash
nargo export --program-dir=./circuits/myNoirLib
```

### Generate TypeScript bindings from exported functions

To use the `noir-codegen` package we added to the TypeScript project:

```bash
yarn noir-codegen ./export/your_function.json
```

This creates an `exports` directory with an `index.ts` file containing all exported functions.

**Note:** adding `--out-dir` allows you to specify an output dir for your TypeScript bindings to go. Eg:

```bash
yarn noir-codegen ./export/*.json --out-dir ./path/to/output/dir
```

## Example .nr function to .ts output

Consider a Noir library with this function:

```rust
#[export]
fn not_equal(x: Field, y: Field) -> bool {
    x != y
}
```

After the export and codegen steps, you should have an `index.ts` like:

```typescript
export type Field = string;


export const is_equal_circuit: CompiledCircuit = 
{"abi":{"parameters":[{"name":"x","type":{"kind":"field"},"visibility":"private"},{"name":"y","type":{"kind":"field"},"visibility":"private"}],"return_type":{"abi_type":{"kind":"boolean"},"visibility":"private"}},"bytecode":"H4sIAAAAAAAA/7WUMQ7DIAxFQ0Krrr2JjSGYLVcpKrn/CaqqDQN12WK+hPBgmWd/wEyHbF1SS923uhOs3pfoChI+wKXMAXzIKyNj4PB0TFTYc0w5RUjoqeAeEu1wqK0F54RGkWvW44LPzExnlkbMEs4JNZmN8PxS42uHv82T8a3Jeyn2Ks+VLPcO558HmyLMCDOXAXXtpPt4R/Rt9T36ss6dS9HGPx/eG17nGegKBQAA"};

export async function is_equal(x: Field, y: Field, foreignCallHandler?: ForeignCallHandler): Promise<boolean> {
  const program = new Noir(is_equal_circuit);
  const args: InputMap = { x, y };
  const { returnValue } = await program.execute(args, foreignCallHandler);
  return returnValue as boolean;
}
```

Now the `is_equal()` function and relevant types are readily available for use in TypeScript.
---
title: REPL Debugger
description:
  Noir Debugger REPL options and commands. 
keywords:
  [
    Nargo,
    Noir CLI,
    Noir Debugger,
    REPL,
  ]
sidebar_position: 1
---

## Running the REPL debugger

`nargo debug [OPTIONS] [WITNESS_NAME]`

Runs the Noir REPL debugger. If a `WITNESS_NAME` is provided the debugger writes the resulting execution witness to a `WITNESS_NAME` file.

### Options

| Option                | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `-p, --prover-name <PROVER_NAME>` | The name of the toml file which contains the inputs for the prover [default: Prover]|
| `--package <PACKAGE>` | The name of the package to debug                             |
| `--print-acir`        | Display the ACIR for compiled circuit                        |
| `--deny-warnings`     | Treat all warnings as errors                                 |
| `--silence-warnings`  | Suppress warnings                                            |
| `-h, --help`          | Print help                                                   |

None of these options are required.

:::note
Since the debugger starts by compiling the target package, all Noir compiler options are also available. Check out the [compiler reference](../nargo_commands.md#nargo-compile) to learn more about the compiler options.
:::

## REPL commands

Once the debugger is running, it accepts the following commands.

#### `help` (h)

Displays the menu of available commands.

```
> help
Available commands:

  opcodes                          display ACIR opcodes
  into                             step into to the next opcode
  next                             step until a new source location is reached
  out                              step until a new source location is reached
                                   and the current stack frame is finished
  break LOCATION:OpcodeLocation    add a breakpoint at an opcode location
  over                             step until a new source location is reached
                                   without diving into function calls
  restart                          restart the debugging session
  delete LOCATION:OpcodeLocation   delete breakpoint at an opcode location
  witness                          show witness map
  witness index:u32                display a single witness from the witness map
  witness index:u32 value:String   update a witness with the given value
  memset index:usize value:String  update a memory cell with the given
                                   value
  continue                         continue execution until the end of the
                                   program
  vars                             show variable values available at this point
                                   in execution
  stacktrace                       display the current stack trace
  memory                           show memory (valid when executing unconstrained code)                                 value
  step                             step to the next ACIR opcode

Other commands:

  help  Show this help message
  quit  Quit repl

```

### Stepping through programs

#### `next` (n)

Step until the next Noir source code location. While other commands, such as [`into`](#into-i) and [`step`](#step-s), allow for finer grained control of the program's execution at the opcode level, `next` is source code centric. For example:

```
3    ...
4    fn main(x: u32) {
5        assert(entry_point(x) == 2);
6        swap_entry_point(x, x + 1);
7 ->     assert(deep_entry_point(x) == 4);
8        multiple_values_entry_point(x);
9    }
```


Using `next` here would cause the debugger to jump to the definition of `deep_entry_point` (if available). 

If you want to step over `deep_entry_point` and go straight to line 8, use [the `over` command](#over) instead.

#### `over`

Step until the next source code location, without diving into function calls. For example:

```
3    ...
4    fn main(x: u32) {
5        assert(entry_point(x) == 2);
6        swap_entry_point(x, x + 1);
7 ->     assert(deep_entry_point(x) == 4);
8        multiple_values_entry_point(x);
9    }
```


Using `over` here would cause the debugger to execute until line 8 (`multiple_values_entry_point(x);`).

If you want to step into `deep_entry_point` instead, use [the `next` command](#next-n).

#### `out`

Step until the end of the current function call. For example:

```
  3    ...
  4    fn main(x: u32) {
  5        assert(entry_point(x) == 2);
  6        swap_entry_point(x, x + 1);
  7 ->     assert(deep_entry_point(x) == 4);
  8        multiple_values_entry_point(x);
  9    }
 10    
 11    unconstrained fn returns_multiple_values(x: u32) -> (u32, u32, u32, u32) {
 12    ...
 ...
 55    
 56    unconstrained fn deep_entry_point(x: u32) -> u32 {
 57 ->     level_1(x + 1)
 58    }

```

Running `out` here will resume execution until line 8.

#### `step` (s)

Skips to the next ACIR code. A compiled Noir program is a sequence of ACIR opcodes. However, an unconstrained VM opcode denotes the start of an unconstrained code block, to be executed by the unconstrained VM. For example (redacted for brevity):

```
0  BLACKBOX::RANGE [(_0, num_bits: 32)] [ ]
1 ->  BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(0))], q_c: 0 })] outputs=[Simple(Witness(1))]
	1.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
	1.1  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
	1.2  |   Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
	1.3  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
	1.4  |   Call { location: 7 }
	...
	1.43 |   Return
2    EXPR [ (1, _1) -2 ]
```

The `->` here shows the debugger paused at an ACIR opcode: `BRILLIG`, at index 1, which denotes an unconstrained code block is about to start.

Using the `step` command at this point would result in the debugger stopping at ACIR opcode 2, `EXPR`, skipping unconstrained computation steps.

Use [the `into` command](#into-i) instead if you want to follow unconstrained computation step by step.

#### `into` (i)

Steps into the next opcode. A compiled Noir program is a sequence of ACIR opcodes. However, a BRILLIG opcode denotes the start of an unconstrained code block, to be executed by the unconstrained VM. For example (redacted for brevity):

```
0  BLACKBOX::RANGE [(_0, num_bits: 32)] [ ]
1 ->  BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(0))], q_c: 0 })] outputs=[Simple(Witness(1))]
	1.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
	1.1  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
	1.2  |   Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
	1.3  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
	1.4  |   Call { location: 7 }
	...
	1.43 |   Return
2    EXPR [ (1, _1) -2 ]
``` 

The `->` here shows the debugger paused at an ACIR opcode: `BRILLIG`, at index 1, which denotes an unconstrained code block is about to start.

Using the `into` command at this point would result in the debugger stopping at opcode 1.0, `Mov ...`, allowing the debugger user to follow unconstrained computation step by step.

Use [the `step` command](#step-s) instead if you want to skip to the next ACIR code directly.

#### `continue` (c)

Continues execution until the next breakpoint, or the end of the program.

#### `restart` (res)

Interrupts execution, and restarts a new debugging session from scratch.

#### `opcodes` (o)

Display the program's ACIR opcode sequence. For example:

```
0  BLACKBOX::RANGE [(_0, num_bits: 32)] [ ]
1 ->  BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(0))], q_c: 0 })] outputs=[Simple(Witness(1))]
	1.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
	1.1  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
	1.2  |   Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
	1.3  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
	1.4  |   Call { location: 7 }
	...
	1.43 |   Return
2     EXPR [ (1, _1) -2 ]
```

### Breakpoints

#### `break [Opcode]` (or shorthand `b [Opcode]`)

Sets a breakpoint on the specified opcode index. To get a list of the program opcode numbers, see [the `opcode` command](#opcodes-o). For example:

```
0  BLACKBOX::RANGE [(_0, num_bits: 32)] [ ]
1 ->  BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(0))], q_c: 0 })] outputs=[Simple(Witness(1))]
	1.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
	1.1  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
	1.2  |   Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
	1.3  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
	1.4  |   Call { location: 7 }
	...
	1.43 |   Return
2    EXPR [ (1, _1) -2 ]
```

In this example, issuing a `break 1.2` command adds break on opcode 1.2, as denoted by the `*` character:

```
0  BLACKBOX::RANGE [(_0, num_bits: 32)] [ ]
1 ->  BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(0))], q_c: 0 })] outputs=[Simple(Witness(1))]
	1.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
	1.1  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
	1.2  | * Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
	1.3  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
	1.4  |   Call { location: 7 }
	...
	1.43 |   Return
2    EXPR [ (1, _1) -2 ]
```

Running [the `continue` command](#continue-c) at this point would cause the debugger to execute the program until opcode 1.2.

#### `delete [Opcode]` (or shorthand `d [Opcode]`)

Deletes a breakpoint at an opcode location. Usage is analogous to [the `break` command](#).

### Variable inspection

#### vars

Show variable values available at this point in execution.

:::note
The ability to inspect variable values from the debugger depends on compilation to be run in a special debug instrumentation mode. This instrumentation weaves variable tracing code with the original source code. 

So variable value inspection comes at the expense of making the resulting ACIR bytecode bigger and harder to understand and optimize.

If you find this compromise unacceptable, you can run the debugger with the flag `--skip-debug-instrumentation`. This will compile your circuit without any additional debug information, so the resulting ACIR bytecode will be identical to the one produced by standard Noir compilation. However, if you opt for this, the `vars` command will not be available while debugging.
:::


### Stacktrace

#### `stacktrace`

Displays the current stack trace.


### Witness map

#### `witness` (w)

Show witness map. For example:

```
_0 = 0
_1 = 2
_2 = 1
```

#### `witness [Witness Index]`

Display a single witness from the witness map. For example:

```
> witness 1
_1 = 2
```

#### `witness [Witness Index] [New value]`

Overwrite the given index with a new value. For example:

```
> witness 1 3
_1 = 3
```


### Unconstrained VM memory

#### `memory`

Show unconstrained VM memory state. For example:

```
> memory
At opcode 1.13: Store { destination_pointer: RegisterIndex(0), source: RegisterIndex(3) }
...
> registers
0 = 0
1 = 10
2 = 0
3 = 1
4 = 1
5 = 2³²
6 = 1
> into
At opcode 1.14: Const { destination: RegisterIndex(5), value: Value { inner: 1 } }
...
> memory
0 = 1
>
```

In the example above: we start with clean memory, then step through a `Store` opcode which stores the value of register 3 (1) into the memory address stored in register 0 (0). Thus now `memory` shows memory address 0 contains value 1.

:::note
This command is only functional while the debugger is executing unconstrained code.
:::

#### `memset [Memory address] [New value]`

Update a memory cell with the given value. For example:

```
> memory
0 = 1
> memset 0 2
> memory
0 = 2
> memset 1 4
> memory
0 = 2
1 = 4
>
```

:::note
This command is only functional while the debugger is executing unconstrained code.
:::---
title: Known limitations
description:
  An overview of known limitations of the current version of the Noir debugger
keywords:
  [
    Nargo,
    Noir Debugger,
    VS Code,
  ]
sidebar_position: 2
---

# Debugger Known Limitations

There are currently some limits to what the debugger can observe. 

## Mutable references

The debugger is currently blind to any state mutated via a mutable reference. For example, in:

```
let mut x = 1;
let y = &mut x;
*y = 2;
```

The update on `x` will not be observed by the debugger. That means, when running `vars` from the debugger REPL, or inspecting the _local variables_ pane in the VS Code debugger, `x` will appear with value 1 despite having executed `*y = 2;`.

## Variables of type function or mutable references are opaque

When inspecting variables, any variable of type `Function` or `MutableReference` will render its value as `<<function>>` or `<<mutable ref>>`.

## Debugger instrumentation affects resulting ACIR
                      
In order to make the state of local variables observable, the debugger compiles Noir circuits interleaving foreign calls that track any mutations to them. While this works (except in the cases described above) and doesn't introduce any behavior changes, it does as a side effect produce bigger bytecode. In particular, when running the command `opcodes` on the REPL debugger, you will notice Unconstrained VM blocks that look like this:

```
...
5    BRILLIG inputs=[Single(Expression { mul_terms: [], linear_combinations: [], q_c: 2 }), Single(Expression { mul_terms: [], linear_combinations: [(1, Witness(2))], q_c: 0 })]
       |       outputs=[]
  5.0  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(0) }
  5.1  |   Mov { destination: RegisterIndex(3), source: RegisterIndex(1) }
  5.2  |   Const { destination: RegisterIndex(0), value: Value { inner: 0 } }
  5.3  |   Const { destination: RegisterIndex(1), value: Value { inner: 0 } }
  5.4  |   Mov { destination: RegisterIndex(2), source: RegisterIndex(2) }
  5.5  |   Mov { destination: RegisterIndex(3), source: RegisterIndex(3) }
  5.6  |   Call { location: 8 }
  5.7  |   Stop
  5.8  |   ForeignCall { function: "__debug_var_assign", destinations: [], inputs: [RegisterIndex(RegisterIndex(2)), RegisterIndex(RegisterIndex(3))] }
...
```               
                                    
If you are interested in debugging/inspecting compiled ACIR without these synthetic changes, you can invoke the REPL debugger with the `--skip-instrumentation` flag or launch the VS Code debugger with the `skipConfiguration` property set to true in its launch configuration. You can find more details about those in the [Debugger REPL reference](debugger_repl.md) and the [VS Code Debugger reference](debugger_vscode.md).

:::note
Skipping debugger instrumentation means you won't be able to inspect values of local variables.
:::

---
title: VS Code Debugger
description:
  VS Code Debugger configuration and features.
keywords:
  [
    Nargo,
    Noir CLI,
    Noir Debugger,
    VS Code,
    IDE,
  ]
sidebar_position: 0
---

# VS Code Noir Debugger Reference

The Noir debugger enabled by the vscode-noir extension ships with default settings such that the most common scenario should run without any additional configuration steps.

These defaults can nevertheless be overridden by defining a launch configuration file. This page provides a reference for the properties you can override via a launch configuration file, as well as documenting the Nargo `dap` command, which is a dependency of the VS Code Noir debugger. 


## Creating and editing launch configuration files

To create a launch configuration file from VS Code, open the _debug pane_, and click on _create a launch.json file_. 

![Creating a launch configuration file](@site/static/img/debugger/ref1-create-launch.png)

A `launch.json` file will be created, populated with basic defaults. 

### Noir Debugger launch.json properties

#### projectFolder

_String, optional._

Absolute path to the Nargo project to debug. By default, it is dynamically determined by looking for the nearest `Nargo.toml` file to the active file at the moment of launching the debugger. 

#### proverName

_String, optional._

Name of the prover input to use. Defaults to `Prover`, which looks for a file named `Prover.toml` at the `projectFolder`.

#### generateAcir

_Boolean, optional._

If true, generate ACIR opcodes instead of unconstrained opcodes which will be closer to release binaries but less convenient for debugging. Defaults to `false`.
                
#### skipInstrumentation

_Boolean, optional._

Skips variables debugging instrumentation of code, making debugging less convenient but the resulting binary smaller and closer to production. Defaults to `false`.

:::note
Skipping instrumentation causes the debugger to be unable to inspect local variables.
:::

## `nargo dap [OPTIONS]`

When run without any option flags, it starts the Nargo Debug Adapter Protocol server, which acts as the debugging backend for the VS Code Noir Debugger. 

All option flags are related to preflight checks. The Debug Adapter Protocol specifies how errors are to be informed from a running DAP server, but it doesn't specify mechanisms to communicate server initialization errors between the DAP server and its client IDE. 

Thus `nargo dap` ships with a _preflight check_ mode. If flag `--preflight-check` and the rest of the `--preflight-*` flags are provided, Nargo will run the same initialization routine except it will not start the DAP server.

`vscode-noir` will then run `nargo dap` in preflight check mode first before a debugging session starts. If the preflight check ends in error, vscode-noir will present stderr and stdout output from this process through its own Output pane in VS Code. This makes it possible for users to diagnose what pieces of configuration might be wrong or missing in case of initialization errors.

If the preflight check succeeds, `vscode-noir` proceeds to start the DAP server normally but running `nargo dap` without any additional flags.

### Options

| Option                                  | Description                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--preflight-check`                     | If present, dap runs in preflight check mode.                               |
| `--preflight-project-folder <PREFLIGHT_PROJECT_FOLDER>`   | Absolute path to the project to debug for preflight check.                        |
| `--preflight-prover-name <PREFLIGHT_PROVER_NAME>`       | Name of prover file to use for preflight check                              |
| `--preflight-generate-acir`                 | Optional. If present, compile in ACIR mode while running preflight check.                                 |
| `--preflight-skip-instrumentation`            | Optional. If present, compile without introducing debug instrumentation while running preflight check.  |
| `-h, --help`                            | Print help.                                               |
---
title: Migration notes
description: Read about migration notes from previous versions, which could solve problems while updating
keywords: [Noir, notes, migration, updating, upgrading]
---

Noir is in full-speed development. Things break fast, wild, and often. This page attempts to leave some notes on errors you might encounter when upgrading and how to resolve them until proper patches are built.

### `backend encountered an error: libc++.so.1`

Depending on your OS, you may encounter the following error when running `nargo prove` for the first time:

```text
The backend encountered an error: "/home/codespace/.nargo/backends/acvm-backend-barretenberg/backend_binary: error while loading shared libraries: libc++.so.1: cannot open shared object file: No such file or directory\n"
```

Install the `libc++-dev` library with:

```bash
sudo apt install libc++-dev
```

## ≥0.19

### Enforcing `compiler_version`

From this version on, the compiler will check for the `compiler_version` field in `Nargo.toml`, and will error if it doesn't match the current Nargo version in use.

To update, please make sure this field in `Nargo.toml` matches the output of `nargo --version`.

## ≥0.14

The index of the [for loops](noir/concepts/control_flow.md#loops) is now of type `u64` instead of `Field`. An example refactor would be:

```rust
for i in 0..10 {
    let i = i as Field;
}
```

## ≥v0.11.0 and Nargo backend

From this version onwards, Nargo starts managing backends through the `nargo backend` command. Upgrading to the versions per usual steps might lead to:

### `backend encountered an error`

This is likely due to the existing locally installed version of proving backend (e.g. barretenberg) is incompatible with the version of Nargo in use.

To fix the issue:

1. Uninstall the existing backend

```bash
nargo backend uninstall acvm-backend-barretenberg
```

You may replace _acvm-backend-barretenberg_ with the name of your backend listed in `nargo backend ls` or in ~/.nargo/backends.

2. Reinstall a compatible version of the proving backend.

If you are using the default barretenberg backend, simply run:

```
nargo prove
```

with your Noir program.

This will trigger the download and installation of the latest version of barretenberg compatible with your Nargo in use.

### `backend encountered an error: illegal instruction`

On certain Intel-based systems, an `illegal instruction` error may arise due to incompatibility of barretenberg with certain CPU instructions.

To fix the issue:

1. Uninstall the existing backend

```bash
nargo backend uninstall acvm-backend-barretenberg
```

You may replace _acvm-backend-barretenberg_ with the name of your backend listed in `nargo backend ls` or in ~/.nargo/backends.

2. Reinstall a compatible version of the proving backend.

If you are using the default barretenberg backend, simply run:

```
nargo backend install acvm-backend-barretenberg https://github.com/noir-lang/barretenberg-js-binary/raw/master/run-bb.tar.gz
```

This downloads and installs a specific bb.js based version of barretenberg binary from GitHub.

The gzipped file is running [this bash script](https://github.com/noir-lang/barretenberg-js-binary/blob/master/run-bb-js.sh), where we need to gzip it as the Nargo currently expect the backend to be zipped up.

Then run:

```
DESIRED_BINARY_VERSION=0.8.1 nargo info
```

This overrides the bb native binary with a bb.js node application instead, which should be compatible with most if not all hardware. This does come with the drawback of being generally slower than native binary.

0.8.1 indicates bb.js version 0.8.1, so if you change that it will update to a different version or the default version in the script if none was supplied.
---
title: Bn254 Field Library
---

Noir provides a module in standard library with some optimized functions for bn254 Fr in `std::field::bn254`.

## decompose

```rust
fn decompose(x: Field) -> (Field, Field) {}
```

Decomposes a single field into two fields, low and high. The low field contains the lower 16 bytes of the input field and the high field contains the upper 16 bytes of the input field. Both field results are range checked to 128 bits.


## assert_gt

```rust
fn assert_gt(a: Field, b: Field) {}
```

Asserts that a > b. This will generate less constraints than using `assert(gt(a, b))`.

## assert_lt

```rust
fn assert_lt(a: Field, b: Field) {}
```

Asserts that a < b. This will generate less constraints than using `assert(lt(a, b))`.

## gt

```rust
fn gt(a: Field, b: Field) -> bool  {}
```

Returns true if a > b.

## lt

```rust
fn lt(a: Field, b: Field) -> bool  {}
```

Returns true if a < b.---
title: Containers
description: Container types provided by Noir's standard library for storing and retrieving data
keywords: [containers, data types, vec, hashmap]
---
---
title: Bounded Vectors
keywords: [noir, vector, bounded vector, slice]
sidebar_position: 1
---

A `BoundedVec<T, MaxLen>` is a growable storage similar to a `Vec<T>` except that it
is bounded with a maximum possible length. Unlike `Vec`, `BoundedVec` is not implemented
via slices and thus is not subject to the same restrictions slices are (notably, nested
slices - and thus nested vectors as well - are disallowed).

Since a BoundedVec is backed by a normal array under the hood, growing the BoundedVec by
pushing an additional element is also more efficient - the length only needs to be increased
by one.

For these reasons `BoundedVec<T, N>` should generally be preferred over `Vec<T>` when there
is a reasonable maximum bound that can be placed on the vector.

Example:

```rust
let mut vector: BoundedVec<Field, 10> = BoundedVec::new();
for i in 0..5 {
    vector.push(i);
}
assert(vector.len() == 5);
assert(vector.max_len() == 10);
```

## Methods

### new

```rust
pub fn new() -> Self
```

Creates a new, empty vector of length zero.

Since this container is backed by an array internally, it still needs an initial value
to give each element. To resolve this, each element is zeroed internally. This value
is guaranteed to be inaccessible unless `get_unchecked` is used.

Example:

```rust
let empty_vector: BoundedVec<Field, 10> = BoundedVec::new();
assert(empty_vector.len() == 0);
```

Note that whenever calling `new` the maximum length of the vector should always be specified
via a type signature:

#include_code new_example test_programs/noir_test_success/bounded_vec/src/main.nr rust

This defaulting of `MaxLen` (and numeric generics in general) to zero may change in future noir versions
but for now make sure to use type annotations when using bounded vectors. Otherwise, you will receive a constraint failure at runtime when the vec is pushed to.

### get

```rust
pub fn get(self, index: u64) -> T {
```

Retrieves an element from the vector at the given index, starting from zero.

If the given index is equal to or greater than the length of the vector, this
will issue a constraint failure.

Example:

```rust
fn foo<N>(v: BoundedVec<u32, N>) {
    let first = v.get(0);
    let last = v.get(v.len() - 1);
    assert(first != last);
}
```

### get_unchecked

```rust
pub fn get_unchecked(self, index: u64) -> T {
```

Retrieves an element from the vector at the given index, starting from zero, without
performing a bounds check.

Since this function does not perform a bounds check on length before accessing the element,
it is unsafe! Use at your own risk!

Example:

#include_code get_unchecked_example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### set

```rust
pub fn set(&mut self: Self, index: u64, value: T) {
```

Writes an element to the vector at the given index, starting from zero.

If the given index is equal to or greater than the length of the vector, this will issue a constraint failure.

Example:

```rust
fn foo<N>(v: BoundedVec<u32, N>) {
    let first = v.get(0);
    assert(first != 42);
    v.set(0, 42);
    let new_first = v.get(0);
    assert(new_first == 42);
}
```

### set_unchecked

```rust
pub fn set_unchecked(&mut self: Self, index: u64, value: T) -> T {
```

Writes an element to the vector at the given index, starting from zero, without performing a bounds check.

Since this function does not perform a bounds check on length before accessing the element, it is unsafe! Use at your own risk!

Example:

#include_code set_unchecked_example test_programs/noir_test_success/bounded_vec/src/main.nr rust


### push

```rust
pub fn push(&mut self, elem: T) {
```

Pushes an element to the end of the vector. This increases the length
of the vector by one.

Panics if the new length of the vector will be greater than the max length.

Example:

#include_code bounded-vec-push-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### pop

```rust
pub fn pop(&mut self) -> T
```

Pops the element at the end of the vector. This will decrease the length
of the vector by one.

Panics if the vector is empty.

Example:

#include_code bounded-vec-pop-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### len

```rust
pub fn len(self) -> u64 {
```

Returns the current length of this vector

Example:

#include_code bounded-vec-len-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### max_len

```rust
pub fn max_len(_self: BoundedVec<T, MaxLen>) -> u64 {
```

Returns the maximum length of this vector. This is always
equal to the `MaxLen` parameter this vector was initialized with.

Example:

#include_code bounded-vec-max-len-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### storage

```rust
pub fn storage(self) -> [T; MaxLen] {
```

Returns the internal array within this vector.
Since arrays in Noir are immutable, mutating the returned storage array will not mutate
the storage held internally by this vector.

Note that uninitialized elements may be zeroed out!

Example:

#include_code bounded-vec-storage-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### extend_from_array

```rust
pub fn extend_from_array<Len>(&mut self, array: [T; Len])
```

Pushes each element from the given array to this vector.

Panics if pushing each element would cause the length of this vector
to exceed the maximum length.

Example:

#include_code bounded-vec-extend-from-array-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### extend_from_bounded_vec

```rust
pub fn extend_from_bounded_vec<Len>(&mut self, vec: BoundedVec<T, Len>)
```

Pushes each element from the other vector to this vector. The length of
the other vector is left unchanged.

Panics if pushing each element would cause the length of this vector
to exceed the maximum length.

Example:

#include_code bounded-vec-extend-from-bounded-vec-example test_programs/noir_test_success/bounded_vec/src/main.nr rust

### from_array

```rust
pub fn from_array<Len>(array: [T; Len]) -> Self
```

Creates a new vector, populating it with values derived from an array input. 
The maximum length of the vector is determined based on the type signature.

Example:
```rust
let bounded_vec: BoundedVec<Field, 10> = BoundedVec::from_array([1, 2, 3])
```

### from_parts

```rust
pub fn from_parts(mut array: [T; MaxLen], len: u32) -> Self
```

Creates a new BoundedVec from the given array and length.
The given length must be less than or equal to the length of the array.

This function will zero out any elements at or past index `len` of `array`.
This incurs an extra runtime cost of O(MaxLen). If you are sure your array is
zeroed after that index, you can use `from_parts_unchecked` to remove the extra loop.

Example:

#include_code from-parts noir_stdlib/src/collections/bounded_vec.nr rust

### from_parts_unchecked

```rust
pub fn from_parts_unchecked(array: [T; MaxLen], len: u32) -> Self
```

Creates a new BoundedVec from the given array and length.
The given length must be less than or equal to the length of the array.

This function is unsafe because it expects all elements past the `len` index
of `array` to be zeroed, but does not check for this internally. Use `from_parts`
for a safe version of this function which does zero out any indices past the
given length. Invalidating this assumption can notably cause `BoundedVec::eq`
to give incorrect results since it will check even elements past `len`.

Example:

#include_code from-parts-unchecked noir_stdlib/src/collections/bounded_vec.nr rust

### map

```rust
pub fn map<U, Env>(self, f: fn[Env](T) -> U) -> BoundedVec<U, MaxLen>
```

Creates a new vector of equal size by calling a closure on each element in this vector.  

Example:

#include_code bounded-vec-map-example noir_stdlib/src/collections/bounded_vec.nr rust

### any

```rust
pub fn any<Env>(self, predicate: fn[Env](T) -> bool) -> bool
```

Returns true if the given predicate returns true for any element
in this vector.

Example:

#include_code bounded-vec-any-example test_programs/noir_test_success/bounded_vec/src/main.nr rust
---
title: Vectors
description: Delve into the Vec data type in Noir. Learn about its methods, practical examples, and best practices for using Vectors in your Noir code.
keywords: [noir, vector type, methods, examples, dynamic arrays]
sidebar_position: 6
---

import Experimental from '@site/src/components/Notes/_experimental.mdx';

<Experimental />

A vector is a collection type similar to Rust's `Vec<T>` type. In Noir, it is a convenient way to use slices as mutable arrays.

Example:

```rust
let mut vector: Vec<Field> = Vec::new();
for i in 0..5 {
    vector.push(i);
}
assert(vector.len() == 5);
```

## Methods

### new

Creates a new, empty vector.

```rust
pub fn new() -> Self
```

Example:

```rust
let empty_vector: Vec<Field> = Vec::new();
assert(empty_vector.len() == 0);
```

### from_slice

Creates a vector containing each element from a given slice. Mutations to the resulting vector will not affect the original slice.

```rust
pub fn from_slice(slice: [T]) -> Self
```

Example:

```rust
let slice: [Field] = &[1, 2, 3];
let vector_from_slice = Vec::from_slice(slice);
assert(vector_from_slice.len() == 3);
```

### len

Returns the number of elements in the vector.

```rust
pub fn len(self) -> Field
```

Example:

```rust
let empty_vector: Vec<Field> = Vec::new();
assert(empty_vector.len() == 0);
```

### get

Retrieves an element from the vector at a given index. Panics if the index points beyond the vector's end.

```rust
pub fn get(self, index: Field) -> T
```

Example:

```rust
let vector: Vec<Field> = Vec::from_slice(&[10, 20, 30]);
assert(vector.get(1) == 20);
```

### set

```rust
pub fn set(&mut self: Self, index: u64, value: T) {
```

Writes an element to the vector at the given index, starting from zero.

Panics if the index points beyond the vector's end.

Example:

```rust
let vector: Vec<Field> = Vec::from_slice(&[10, 20, 30]);
assert(vector.get(1) == 20);
vector.set(1, 42);
assert(vector.get(1) == 42);
```

### push

Adds a new element to the vector's end, returning a new vector with a length one greater than the original unmodified vector.

```rust
pub fn push(&mut self, elem: T)
```

Example:

```rust
let mut vector: Vec<Field> = Vec::new();
vector.push(10);
assert(vector.len() == 1);
```

### pop

Removes an element from the vector's end, returning a new vector with a length one less than the original vector, along with the removed element. Panics if the vector's length is zero.

```rust
pub fn pop(&mut self) -> T
```

Example:

```rust
let mut vector = Vec::from_slice(&[10, 20]);
let popped_elem = vector.pop();
assert(popped_elem == 20);
assert(vector.len() == 1);
```

### insert

Inserts an element at a specified index, shifting subsequent elements to the right.

```rust
pub fn insert(&mut self, index: Field, elem: T)
```

Example:

```rust
let mut vector = Vec::from_slice(&[10, 30]);
vector.insert(1, 20);
assert(vector.get(1) == 20);
```

### remove

Removes an element at a specified index, shifting subsequent elements to the left, and returns the removed element.

```rust
pub fn remove(&mut self, index: Field) -> T
```

Example:

```rust
let mut vector = Vec::from_slice(&[10, 20, 30]);
let removed_elem = vector.remove(1);
assert(removed_elem == 20);
assert(vector.len() == 2);
```
---
title: HashMap
keywords: [noir, map, hash, hashmap]
sidebar_position: 1
---

`HashMap<Key, Value, MaxLen, Hasher>` is used to efficiently store and look up key-value pairs.

`HashMap` is a bounded type which can store anywhere from zero to `MaxLen` total elements.
Note that due to hash collisions, the actual maximum number of elements stored by any particular
hashmap is likely lower than `MaxLen`. This is true even with cryptographic hash functions since
every hash value will be performed modulo `MaxLen`.

Example:

```rust
// Create a mapping from Fields to u32s with a maximum length of 12
// using a poseidon2 hasher
use std::hash::poseidon2::Poseidon2Hasher;
let mut map: HashMap<Field, u32, 12, BuildHasherDefault<Poseidon2Hasher>> = HashMap::default();

map.insert(1, 2);
map.insert(3, 4);

let two = map.get(1).unwrap();
```

## Methods

### default

#include_code default noir_stdlib/src/collections/map.nr rust

Creates a fresh, empty HashMap.

When using this function, always make sure to specify the maximum size of the hash map.

This is the same `default` from the `Default` implementation given further below. It is
repeated here for convenience since it is the recommended way to create a hashmap.

Example:

#include_code default_example test_programs/execution_success/hashmap/src/main.nr rust

Because `HashMap` has so many generic arguments that are likely to be the same throughout
your program, it may be helpful to create a type alias:

#include_code type_alias test_programs/execution_success/hashmap/src/main.nr rust

### with_hasher

#include_code with_hasher noir_stdlib/src/collections/map.nr rust

Creates a hashmap with an existing `BuildHasher`. This can be used to ensure multiple
hashmaps are created with the same hasher instance.

Example:

#include_code with_hasher_example test_programs/execution_success/hashmap/src/main.nr rust

### get

#include_code get noir_stdlib/src/collections/map.nr rust

Retrieves a value from the hashmap, returning `Option::none()` if it was not found.

Example:

#include_code get_example test_programs/execution_success/hashmap/src/main.nr rust

### insert

#include_code insert noir_stdlib/src/collections/map.nr rust

Inserts a new key-value pair into the map. If the key was already in the map, its
previous value will be overridden with the newly provided one.

Example:

#include_code insert_example test_programs/execution_success/hashmap/src/main.nr rust

### remove

#include_code remove noir_stdlib/src/collections/map.nr rust

Removes the given key-value pair from the map. If the key was not already present
in the map, this does nothing.

Example:

#include_code remove_example test_programs/execution_success/hashmap/src/main.nr rust

### is_empty

#include_code is_empty noir_stdlib/src/collections/map.nr rust

True if the length of the hash map is empty.

Example:

#include_code is_empty_example test_programs/execution_success/hashmap/src/main.nr rust

### len

#include_code len noir_stdlib/src/collections/map.nr rust

Returns the current length of this hash map.

Example:

#include_code len_example test_programs/execution_success/hashmap/src/main.nr rust

### capacity

#include_code capacity noir_stdlib/src/collections/map.nr rust

Returns the maximum capacity of this hashmap. This is always equal to the capacity
specified in the hashmap's type.

Unlike hashmaps in general purpose programming languages, hashmaps in Noir have a
static capacity that does not increase as the map grows larger. Thus, this capacity
is also the maximum possible element count that can be inserted into the hashmap.
Due to hash collisions (modulo the hashmap length), it is likely the actual maximum
element count will be lower than the full capacity.

Example:

#include_code capacity_example test_programs/execution_success/hashmap/src/main.nr rust

### clear

#include_code clear noir_stdlib/src/collections/map.nr rust

Clears the hashmap, removing all key-value pairs from it.

Example:

#include_code clear_example test_programs/execution_success/hashmap/src/main.nr rust

### contains_key

#include_code contains_key noir_stdlib/src/collections/map.nr rust

True if the hashmap contains the given key. Unlike `get`, this will not also return
the value associated with the key.

Example:

#include_code contains_key_example test_programs/execution_success/hashmap/src/main.nr rust

### entries

#include_code entries noir_stdlib/src/collections/map.nr rust

Returns a vector of each key-value pair present in the hashmap.

The length of the returned vector is always equal to the length of the hashmap.

Example:

#include_code entries_example test_programs/execution_success/hashmap/src/main.nr rust

### keys

#include_code keys noir_stdlib/src/collections/map.nr rust

Returns a vector of each key present in the hashmap.

The length of the returned vector is always equal to the length of the hashmap.

Example:

#include_code keys_example test_programs/execution_success/hashmap/src/main.nr rust

### values

#include_code values noir_stdlib/src/collections/map.nr rust

Returns a vector of each value present in the hashmap.

The length of the returned vector is always equal to the length of the hashmap.

Example:

#include_code values_example test_programs/execution_success/hashmap/src/main.nr rust

### iter_mut

#include_code iter_mut noir_stdlib/src/collections/map.nr rust

Iterates through each key-value pair of the HashMap, setting each key-value pair to the
result returned from the given function.

Note that since keys can be mutated, the HashMap needs to be rebuilt as it is iterated
through. If this is not desired, use `iter_values_mut` if only values need to be mutated,
or `entries` if neither keys nor values need to be mutated.

The iteration order is left unspecified. As a result, if two keys are mutated to become
equal, which of the two values that will be present for the key in the resulting map is also unspecified.

Example:

#include_code iter_mut_example test_programs/execution_success/hashmap/src/main.nr rust

### iter_keys_mut

#include_code iter_keys_mut noir_stdlib/src/collections/map.nr rust

Iterates through the HashMap, mutating each key to the result returned from
the given function.

Note that since keys can be mutated, the HashMap needs to be rebuilt as it is iterated
through. If only iteration is desired and the keys are not intended to be mutated,
prefer using `entries` instead.

The iteration order is left unspecified. As a result, if two keys are mutated to become
equal, which of the two values that will be present for the key in the resulting map is also unspecified.

Example:

#include_code iter_keys_mut_example test_programs/execution_success/hashmap/src/main.nr rust

### iter_values_mut

#include_code iter_values_mut noir_stdlib/src/collections/map.nr rust

Iterates through the HashMap, applying the given function to each value and mutating the
value to equal the result. This function is more efficient than `iter_mut` and `iter_keys_mut`
because the keys are untouched and the underlying hashmap thus does not need to be reordered.

Example:

#include_code iter_values_mut_example test_programs/execution_success/hashmap/src/main.nr rust

### retain

#include_code retain noir_stdlib/src/collections/map.nr rust

Retains only the key-value pairs for which the given function returns true.
Any key-value pairs for which the function returns false will be removed from the map.

Example:

#include_code retain_example test_programs/execution_success/hashmap/src/main.nr rust

## Trait Implementations

### default

#include_code default noir_stdlib/src/collections/map.nr rust

Constructs an empty HashMap.

Example:

#include_code default_example test_programs/execution_success/hashmap/src/main.nr rust

### eq

#include_code eq noir_stdlib/src/collections/map.nr rust

Checks if two HashMaps are equal.

Example:

#include_code eq_example test_programs/execution_success/hashmap/src/main.nr rust
---
title: Option<T> Type
---

The `Option<T>` type is a way to express that a value might be present (`Some(T))` or absent (`None`). It's a safer way to handle potential absence of values, compared to using nulls in many other languages.

```rust
struct Option<T> {
    None,
    Some(T),
}
```

The `Option` type, already imported into your Noir program, can be used directly:

```rust
fn main() {
    let none = Option::none();
    let some = Option::some(3);
}
```

See [this test](https://github.com/noir-lang/noir/blob/5cbfb9c4a06c8865c98ff2b594464b037d821a5c/crates/nargo_cli/tests/test_data/option/src/main.nr) for a more comprehensive set of examples of each of the methods described below.

## Methods

### none

Constructs a none value.

### some

Constructs a some wrapper around a given value.

### is_none

Returns true if the Option is None.

### is_some

Returns true of the Option is Some.

### unwrap

Asserts `self.is_some()` and returns the wrapped value.

### unwrap_unchecked

Returns the inner value without asserting `self.is_some()`. This method can be useful within an if condition when we already know that `option.is_some()`. If the option is None, there is no guarantee what value will be returned, only that it will be of type T for an `Option<T>`.

### unwrap_or

Returns the wrapped value if `self.is_some()`. Otherwise, returns the given default value.

### unwrap_or_else

Returns the wrapped value if `self.is_some()`. Otherwise, calls the given function to return a default value.

### expect

Asserts `self.is_some()` with a provided custom message and returns the contained `Some` value. The custom message is expected to be a format string.

### map

If self is `Some(x)`, this returns `Some(f(x))`. Otherwise, this returns `None`.

### map_or

If self is `Some(x)`, this returns `f(x)`. Otherwise, this returns the given default value.

### map_or_else

If self is `Some(x)`, this returns `f(x)`. Otherwise, this returns `default()`.

### and

Returns None if self is None. Otherwise, this returns `other`.

### and_then

If self is None, this returns None. Otherwise, this calls the given function with the Some value contained within self, and returns the result of that call. In some languages this function is called `flat_map` or `bind`.

### or

If self is Some, return self. Otherwise, return `other`.

### or_else

If self is Some, return self. Otherwise, return `default()`.

### xor

If only one of the two Options is Some, return that option. Otherwise, if both options are Some or both are None, None is returned.

### filter

Returns `Some(x)` if self is `Some(x)` and `predicate(x)` is true. Otherwise, this returns `None`.

### flatten

Flattens an `Option<Option<T>>` into a `Option<T>`. This returns `None` if the outer Option is None. Otherwise, this returns the inner Option.
---
title: Big Integers
description: How to use big integers from Noir standard library
keywords:
  [
    Big Integer,
    Noir programming language,
    Noir libraries,
  ]
---

The BigInt module in the standard library exposes some class of integers which do not fit (well) into a Noir native field. It implements modulo arithmetic, modulo a 'big' prime number.

:::note

The module can currently be considered as `Field`s with fixed modulo sizes used by a set of elliptic curves, in addition to just the native curve. [More work](https://github.com/noir-lang/noir/issues/510) is needed to achieve arbitrarily sized big integers.

:::note

`nargo` can be built with `--profile release-pedantic` to enable extra overflow checks which may affect `BigInt` results in some cases.
Consider the [`noir-bignum`](https://github.com/noir-lang/noir-bignum) library for an optimized alternative approach.

:::

Currently 6 classes of integers (i.e 'big' prime numbers) are available in the module, namely:

- BN254 Fq: Bn254Fq
- BN254 Fr: Bn254Fr
- Secp256k1 Fq: Secpk1Fq
- Secp256k1 Fr: Secpk1Fr
- Secp256r1 Fr: Secpr1Fr
- Secp256r1 Fq: Secpr1Fq

Where XXX Fq and XXX Fr denote respectively the order of the base and scalar field of the (usual) elliptic curve XXX.
For instance the big integer 'Secpk1Fq' in the standard library refers to integers modulo $2^{256}-2^{32}-977$.

Feel free to explore the source code for the other primes:

#include_code big_int_definition noir_stdlib/src/bigint.nr rust

## Example usage

A common use-case is when constructing a big integer from its bytes representation, and performing arithmetic operations on it:

#include_code big_int_example test_programs/execution_success/bigint/src/main.nr rust

## Methods

The available operations for each big integer are:

### from_le_bytes

Construct a big integer from its little-endian bytes representation. Example:

```rust
 // Construct a big integer from a slice of bytes
 let a = Secpk1Fq::from_le_bytes(&[x, y, 0, 45, 2]);
 // Construct a big integer from an array of 32 bytes
 let a = Secpk1Fq::from_le_bytes_32([1;32]);
 ```

Sure, here's the formatted version of the remaining methods:

### to_le_bytes

Return the little-endian bytes representation of a big integer. Example:

```rust
let bytes = a.to_le_bytes();
```

### add

Add two big integers. Example:

```rust
let sum = a + b;
```

### sub

Subtract two big integers. Example:

```rust
let difference = a - b;
```

### mul

Multiply two big integers. Example:

```rust
let product = a * b;
```

### div

Divide two big integers. Note that division is field division and not euclidean division. Example:

```rust
let quotient = a / b;
```

### eq

Compare two big integers. Example:

```rust
let are_equal = a == b;
```
---
title: Black Box Functions
description: Black box functions are functions in Noir that rely on backends implementing support for specialized constraints.
keywords: [noir, black box functions]
---

Black box functions are functions in Noir that rely on backends implementing support for specialized constraints. This makes certain zk-snark unfriendly computations cheaper than if they were implemented in Noir.

The ACVM spec defines a set of blackbox functions which backends will be expected to implement. This allows backends to use optimized implementations of these constraints if they have them, however they may also fallback to less efficient naive implementations if not.

## Function list

Here is a list of the current black box functions:

- [AES128](./cryptographic_primitives/ciphers.mdx#aes128)
- [SHA256](./cryptographic_primitives/hashes.mdx#sha256)
- [Blake2s](./cryptographic_primitives/hashes.mdx#blake2s)
- [Blake3](./cryptographic_primitives/hashes.mdx#blake3)
- [Pedersen Hash](./cryptographic_primitives/hashes.mdx#pedersen_hash)
- [Pedersen Commitment](./cryptographic_primitives/hashes.mdx#pedersen_commitment)
- [ECDSA signature verification](./cryptographic_primitives/ecdsa_sig_verification.mdx)
- [Embedded curve operations (MSM, addition, ...)](./cryptographic_primitives/embedded_curve_ops.mdx)
- AND
- XOR
- RANGE
- [Keccak256](./cryptographic_primitives/hashes.mdx#keccak256)
- [Recursive proof verification](./recursion.mdx)

Most black box functions are included as part of the Noir standard library, however `AND`, `XOR` and `RANGE` are used as part of the Noir language syntax. For instance, using the bitwise operator `&` will invoke the `AND` black box function.

You can view the black box functions defined in the ACVM code [here](https://github.com/noir-lang/noir/blob/master/acvm-repo/acir/src/circuit/black_box_functions.rs).
---
title: Traits
description: Noir's stdlib provides a few commonly used traits.
keywords: [traits, trait, interface, protocol, default, add, eq]
---

## `std::default`

### `std::default::Default`

#include_code default-trait noir_stdlib/src/default.nr rust

Constructs a default value of a type.

Implementations:
```rust
impl Default for Field { .. }

impl Default for i8 { .. }
impl Default for i16 { .. }
impl Default for i32 { .. }
impl Default for i64 { .. }

impl Default for u8 { .. }
impl Default for u16 { .. }
impl Default for u32 { .. }
impl Default for u64 { .. }

impl Default for () { .. }
impl Default for bool { .. }

impl<T, N> Default for [T; N]
    where T: Default { .. }

impl<T> Default for [T] { .. }

impl<A, B> Default for (A, B)
    where A: Default, B: Default { .. }

impl<A, B, C> Default for (A, B, C)
    where A: Default, B: Default, C: Default { .. }

impl<A, B, C, D> Default for (A, B, C, D)
    where A: Default, B: Default, C: Default, D: Default { .. }

impl<A, B, C, D, E> Default for (A, B, C, D, E)
    where A: Default, B: Default, C: Default, D: Default, E: Default { .. }
```

For primitive integer types, the return value of `default` is `0`. Container
types such as arrays are filled with default values of their element type,
except slices whose length is unknown and thus defaulted to zero.

---

## `std::convert`

### `std::convert::From`

#include_code from-trait noir_stdlib/src/convert.nr rust

The `From` trait defines how to convert from a given type `T` to the type on which the trait is implemented.

The Noir standard library provides a number of implementations of `From` between primitive types.
#include_code from-impls noir_stdlib/src/convert.nr rust

#### When to implement `From`

As a general rule of thumb, `From` may be implemented in the [situations where it would be suitable in Rust](https://doc.rust-lang.org/std/convert/trait.From.html#when-to-implement-from):

- The conversion is *infallible*: Noir does not provide an equivalent to Rust's `TryFrom`, if the conversion can fail then provide a named method instead.
- The conversion is *lossless*: semantically, it should not lose or discard information. For example, `u32: From<u16>` can losslessly convert any `u16` into a valid `u32` such that the original `u16` can be recovered. On the other hand, `u16: From<u32>` should not be implemented as `2**16` is a `u32` which cannot be losslessly converted into a `u16`.
- The conversion is *value-preserving*: the conceptual kind and meaning of the resulting value is the same, even though the Noir type and technical representation might be different. While it's possible to infallibly and losslessly convert a `u8` into a `str<2>` hex representation, `4u8` and `"04"` are too different for `str<2>: From<u8>` to be implemented.
- The conversion is *obvious*: it's the only reasonable conversion between the two types. If there's ambiguity on how to convert between them such that the same input could potentially map to two different values then a named method should be used. For instance rather than implementing `U128: From<[u8; 16]>`, the methods `U128::from_le_bytes` and `U128::from_be_bytes` are used as otherwise the endianness of the array would be ambiguous, resulting in two potential values of `U128` from the same byte array.

One additional recommendation specific to Noir is:
- The conversion is *efficient*: it's relatively cheap to convert between the two types. Due to being a ZK DSL, it's more important to avoid unnecessary computation compared to Rust. If the implementation of `From` would encourage users to perform unnecessary conversion, resulting in additional proving time, then it may be preferable to expose functionality such that this conversion may be avoided.

### `std::convert::Into`

The `Into` trait is defined as the reciprocal of `From`. It should be easy to convince yourself that if we can convert to type `A` from type `B`, then it's possible to convert type `B` into type `A`.

For this reason, implementing `From` on a type will automatically generate a matching `Into` implementation. One should always prefer implementing `From` over `Into` as implementing `Into` will not generate a matching `From` implementation.

#include_code into-trait noir_stdlib/src/convert.nr rust

`Into` is most useful when passing function arguments where the types don't quite match up with what the function expects. In this case, the compiler has enough type information to perform the necessary conversion by just appending `.into()` onto the arguments in question.

---

## `std::cmp`

### `std::cmp::Eq`

#include_code eq-trait noir_stdlib/src/cmp.nr rust

Returns `true` if `self` is equal to `other`. Implementing this trait on a type
allows the type to be used with `==` and `!=`.

Implementations:
```rust
impl Eq for Field { .. }

impl Eq for i8 { .. }
impl Eq for i16 { .. }
impl Eq for i32 { .. }
impl Eq for i64 { .. }

impl Eq for u8 { .. }
impl Eq for u16 { .. }
impl Eq for u32 { .. }
impl Eq for u64 { .. }

impl Eq for () { .. }
impl Eq for bool { .. }

impl<T, N> Eq for [T; N]
    where T: Eq { .. }

impl<T> Eq for [T]
    where T: Eq { .. }

impl<A, B> Eq for (A, B)
    where A: Eq, B: Eq { .. }

impl<A, B, C> Eq for (A, B, C)
    where A: Eq, B: Eq, C: Eq { .. }

impl<A, B, C, D> Eq for (A, B, C, D)
    where A: Eq, B: Eq, C: Eq, D: Eq { .. }

impl<A, B, C, D, E> Eq for (A, B, C, D, E)
    where A: Eq, B: Eq, C: Eq, D: Eq, E: Eq { .. }
```

### `std::cmp::Ord`

#include_code ord-trait noir_stdlib/src/cmp.nr rust

`a.cmp(b)` compares two values returning `Ordering::less()` if `a < b`,
`Ordering::equal()` if `a == b`, or `Ordering::greater()` if `a > b`.
Implementing this trait on a type allows `<`, `<=`, `>`, and `>=` to be
used on values of the type.

`std::cmp` also provides `max` and `min` functions for any type which implements the `Ord` trait.

Implementations:

```rust
impl Ord for u8 { .. }
impl Ord for u16 { .. }
impl Ord for u32 { .. }
impl Ord for u64 { .. }

impl Ord for i8 { .. }
impl Ord for i16 { .. }
impl Ord for i32 { .. }

impl Ord for i64 { .. }

impl Ord for () { .. }
impl Ord for bool { .. }

impl<T, N> Ord for [T; N]
    where T: Ord { .. }

impl<T> Ord for [T]
    where T: Ord { .. }

impl<A, B> Ord for (A, B)
    where A: Ord, B: Ord { .. }

impl<A, B, C> Ord for (A, B, C)
    where A: Ord, B: Ord, C: Ord { .. }

impl<A, B, C, D> Ord for (A, B, C, D)
    where A: Ord, B: Ord, C: Ord, D: Ord { .. }

impl<A, B, C, D, E> Ord for (A, B, C, D, E)
    where A: Ord, B: Ord, C: Ord, D: Ord, E: Ord { .. }
```

---

## `std::ops`

### `std::ops::Add`, `std::ops::Sub`, `std::ops::Mul`, and `std::ops::Div`

These traits abstract over addition, subtraction, multiplication, and division respectively.
Implementing these traits for a given type will also allow that type to be used with the corresponding operator
for that trait (`+` for Add, etc) in addition to the normal method names.

#include_code add-trait noir_stdlib/src/ops/arith.nr rust
#include_code sub-trait noir_stdlib/src/ops/arith.nr rust
#include_code mul-trait noir_stdlib/src/ops/arith.nr rust
#include_code div-trait noir_stdlib/src/ops/arith.nr rust

The implementations block below is given for the `Add` trait, but the same types that implement
`Add` also implement `Sub`, `Mul`, and `Div`.

Implementations:
```rust
impl Add for Field { .. }

impl Add for i8 { .. }
impl Add for i16 { .. }
impl Add for i32 { .. }
impl Add for i64 { .. }

impl Add for u8 { .. }
impl Add for u16 { .. }
impl Add for u32 { .. }
impl Add for u64 { .. }
```

### `std::ops::Rem`

#include_code rem-trait noir_stdlib/src/ops/arith.nr rust

`Rem::rem(a, b)` is the remainder function returning the result of what is
left after dividing `a` and `b`. Implementing `Rem` allows the `%` operator
to be used with the implementation type.

Unlike other numeric traits, `Rem` is not implemented for `Field`.

Implementations:
```rust
impl Rem for u8 { fn rem(self, other: u8) -> u8 { self % other } }
impl Rem for u16 { fn rem(self, other: u16) -> u16 { self % other } }
impl Rem for u32 { fn rem(self, other: u32) -> u32 { self % other } }
impl Rem for u64 { fn rem(self, other: u64) -> u64 { self % other } }

impl Rem for i8 { fn rem(self, other: i8) -> i8 { self % other } }
impl Rem for i16 { fn rem(self, other: i16) -> i16 { self % other } }
impl Rem for i32 { fn rem(self, other: i32) -> i32 { self % other } }
impl Rem for i64 { fn rem(self, other: i64) -> i64 { self % other } }
```

### `std::ops::Neg`

#include_code neg-trait noir_stdlib/src/ops/arith.nr rust

`Neg::neg` is equivalent to the unary negation operator `-`.

Implementations:
#include_code neg-trait-impls noir_stdlib/src/ops/arith.nr rust

### `std::ops::Not`

#include_code not-trait noir_stdlib/src/ops/bit.nr rust

`Not::not` is equivalent to the unary bitwise NOT operator `!`.

Implementations:
#include_code not-trait-impls noir_stdlib/src/ops/bit.nr rust

### `std::ops::{ BitOr, BitAnd, BitXor }`

#include_code bitor-trait noir_stdlib/src/ops/bit.nr rust
#include_code bitand-trait noir_stdlib/src/ops/bit.nr rust
#include_code bitxor-trait noir_stdlib/src/ops/bit.nr rust

Traits for the bitwise operations `|`, `&`, and `^`.

Implementing `BitOr`, `BitAnd` or `BitXor` for a type allows the `|`, `&`, or `^` operator respectively
to be used with the type.

The implementations block below is given for the `BitOr` trait, but the same types that implement
`BitOr` also implement `BitAnd` and `BitXor`.

Implementations:
```rust
impl BitOr for bool { fn bitor(self, other: bool) -> bool { self | other } }

impl BitOr for u8 { fn bitor(self, other: u8) -> u8 { self | other } }
impl BitOr for u16 { fn bitor(self, other: u16) -> u16 { self | other } }
impl BitOr for u32 { fn bitor(self, other: u32) -> u32 { self | other } }
impl BitOr for u64 { fn bitor(self, other: u64) -> u64 { self | other } }

impl BitOr for i8 { fn bitor(self, other: i8) -> i8 { self | other } }
impl BitOr for i16 { fn bitor(self, other: i16) -> i16 { self | other } }
impl BitOr for i32 { fn bitor(self, other: i32) -> i32 { self | other } }
impl BitOr for i64 { fn bitor(self, other: i64) -> i64 { self | other } }
```

### `std::ops::{ Shl, Shr }`

#include_code shl-trait noir_stdlib/src/ops/bit.nr rust
#include_code shr-trait noir_stdlib/src/ops/bit.nr rust

Traits for a bit shift left and bit shift right.

Implementing `Shl` for a type allows the left shift operator (`<<`) to be used with the implementation type.
Similarly, implementing `Shr` allows the right shift operator (`>>`) to be used with the type.

Note that bit shifting is not currently implemented for signed types.

The implementations block below is given for the `Shl` trait, but the same types that implement
`Shl` also implement `Shr`.

Implementations:
```rust
impl Shl for u8 { fn shl(self, other: u8) -> u8 { self << other } }
impl Shl for u16 { fn shl(self, other: u16) -> u16 { self << other } }
impl Shl for u32 { fn shl(self, other: u32) -> u32 { self << other } }
impl Shl for u64 { fn shl(self, other: u64) -> u64 { self << other } }
```

---

## `std::append`

### `std::append::Append`

`Append` can abstract over types that can be appended to - usually container types:

#include_code append-trait noir_stdlib/src/append.nr rust

`Append` requires two methods:

- `empty`: Constructs an empty value of `Self`.
- `append`: Append two values together, returning the result.

Additionally, it is expected that for any implementation:

- `T::empty().append(x) == x`
- `x.append(T::empty()) == x`

Implementations:
```rust
impl<T> Append for [T]
impl Append for Quoted
```
---
title: TraitImpl
---

`std::meta::trait_impl` contains methods on the built-in `TraitImpl` type which represents a trait
implementation such as `impl Foo for Bar { ... }`.

## Methods

### trait_generic_args

#include_code trait_generic_args noir_stdlib/src/meta/trait_impl.nr rust

Returns any generic arguments on the trait of this trait implementation, if any.

```rs
impl Foo<i32, Field> for Bar { ... }

comptime {
    let bar_type = quote { Bar }.as_type();
    let foo = quote { Foo<i32, Field> }.as_trait_constraint();

    let my_impl: TraitImpl = bar_type.get_trait_impl(foo).unwrap();

    let generics = my_impl.trait_generic_args();
    assert_eq(generics.len(), 2);

    assert_eq(generics[0], quote { i32 }.as_type());
    assert_eq(generics[1], quote { Field }.as_type());
}
```

### methods

#include_code methods noir_stdlib/src/meta/trait_impl.nr rust

Returns each method in this trait impl.

Example:

```rs
comptime {
    let i32_type = quote { i32 }.as_type();
    let eq = quote { Eq }.as_trait_constraint();

    let impl_eq_for_i32: TraitImpl = i32_type.get_trait_impl(eq).unwrap();
    let methods = impl_eq_for_i32.methods();

    assert_eq(methods.len(), 1);
    assert_eq(methods[0].name(), quote { eq });
}
```
---
title: Metaprogramming
description: Noir's Metaprogramming API
keywords: [metaprogramming, comptime, macros, macro, quote, unquote]
---

`std::meta` is the entry point for Noir's metaprogramming API. This consists of `comptime` functions
and types used for inspecting and modifying Noir programs.

## Functions

### type_of

#include_code type_of noir_stdlib/src/meta/mod.nr rust

Returns the type of a variable at compile-time.

Example:
```rust
comptime {
    let x: i32 = 1;
    let x_type: Type = std::meta::type_of(x);

    assert_eq(x_type, quote { i32 }.as_type());
}
```

### unquote

#include_code unquote noir_stdlib/src/meta/mod.nr rust

Unquotes the passed-in token stream where this function was called.

Example:
```rust
comptime {
    let code = quote { 1 + 2 };

    // let x = 1 + 2;
    let x = unquote!(code);
}
```

### derive

#include_code derive noir_stdlib/src/meta/mod.nr rust

Attribute placed on struct definitions.

Creates a trait impl for each trait passed in as an argument.
To do this, the trait must have a derive handler registered
with `derive_via` beforehand. The traits in the stdlib that
can be derived this way are `Eq`, `Ord`, `Default`, and `Hash`.

Example:
```rust
#[derive(Eq, Default)]
struct Foo<T> {
    x: i32,
    y: T,
}

fn main() {
    let foo1 = Foo::default();
    let foo2 = Foo { x: 0, y: &[0] };
    assert_eq(foo1, foo2);
}
```

### derive_via

#include_code derive_via_signature noir_stdlib/src/meta/mod.nr rust

Attribute placed on trait definitions.

Registers a function to create impls for the given trait
when the trait is used in a `derive` call. Users may use
this to register their own functions to enable their traits
to be derived by `derive`.

Because this function requires a function as an argument which
should produce a trait impl for any given struct, users may find
it helpful to use a function like `std::meta::make_trait_impl` to
help creating these impls.

Example:
```rust
#[derive_via(derive_do_nothing)]
trait DoNothing {
    fn do_nothing(self);
}

comptime fn derive_do_nothing(s: StructDefinition) -> Quoted {
    let typ = s.as_type();
    quote {
        impl DoNothing for $typ {
            fn do_nothing(self) {
                println("Nothing");
            }
        }
    }
}
```

As another example, `derive_eq` in the stdlib is used to derive the `Eq`
trait for any struct. It makes use of `make_trait_impl` to do this:

#include_code derive_eq noir_stdlib/src/cmp.nr rust

### make_trait_impl

#include_code make_trait_impl noir_stdlib/src/meta/mod.nr rust

A helper function to more easily create trait impls while deriving traits.

Note that this function only works for traits which:
1. Have only one method
2. Have no generics on the trait itself.
  - E.g. Using this on a trait such as `trait Foo<T> { ... }` will result in the
    generated impl incorrectly missing the `T` generic.

If your trait fits these criteria then `make_trait_impl` is likely the easiest
way to write your derive handler. The arguments are as follows:

- `s`: The struct to make the impl for
- `trait_name`: The name of the trait to derive. E.g. `quote { Eq }`.
- `function_signature`: The signature of the trait method to derive. E.g. `fn eq(self, other: Self) -> bool`.
- `for_each_field`: An operation to be performed on each field. E.g. `|name| quote { (self.$name == other.$name) }`.
- `join_fields_with`: A separator to join each result of `for_each_field` with.
  E.g. `quote { & }`. You can also use an empty `quote {}` for no separator.
- `body`: The result of the field operations is passed into this function for any final processing.
  This is the place to insert any setup/teardown code the trait requires. If the trait doesn't require
  any such code, you can return the body as-is: `|body| body`.

Example deriving `Hash`:

#include_code derive_hash noir_stdlib/src/hash/mod.nr rust

Example deriving `Ord`:

#include_code derive_ord noir_stdlib/src/cmp.nr rust
---
title: TraitConstraint
---

`std::meta::trait_constraint` contains methods on the built-in `TraitConstraint` type which represents
a trait constraint that can be used to search for a trait implementation. This is similar
syntactically to just the trait itself, but can also contain generic arguments. E.g. `Eq`, `Default`,
`BuildHasher<Poseidon2Hasher>`.

This type currently has no public methods but it can be used alongside `Type` in `implements` or `get_trait_impl`.

## Trait Implementations

```rust
impl Eq for TraitConstraint
impl Hash for TraitConstraint
```
---
title: CtString
---

`std::meta::ctstring` contains methods on the built-in `CtString` type which is
a compile-time, dynamically-sized string type. Compared to `str<N>` and `fmtstr<N, T>`,
`CtString` is useful because its size does not need to be specified in its type. This
can be used for formatting items at compile-time or general string handling in `comptime`
code.

Since `fmtstr`s can be converted into `CtString`s, you can make use of their formatting
abilities in CtStrings by formatting in `fmtstr`s then converting the result to a CtString
afterward.

## Traits

### AsCtString

#include_code as-ctstring noir_stdlib/src/meta/ctstring.nr rust

Converts an object into a compile-time string.

Implementations:

```rust
impl<let N: u32> AsCtString for str<N> { ... }
impl<let N: u32, T> AsCtString for fmtstr<N, T> { ... }
```

## Methods

### new

#include_code new noir_stdlib/src/meta/ctstring.nr rust

Creates an empty `CtString`.

### append_str

#include_code append_str noir_stdlib/src/meta/ctstring.nr rust

Returns a new CtString with the given str appended onto the end.

### append_fmtstr

#include_code append_fmtstr noir_stdlib/src/meta/ctstring.nr rust

Returns a new CtString with the given fmtstr appended onto the end.

### as_quoted_str

#include_code as_quoted_str noir_stdlib/src/meta/ctstring.nr rust

Returns a quoted string literal from this string's contents.

There is no direct conversion from a `CtString` to a `str<N>` since
the size would not be known. To get around this, this function can
be used in combination with macro insertion (`!`) to insert this string
literal at this function's call site.

Example:

#include_code as_quoted_str_example noir_stdlib/src/meta/ctstring.nr rust

## Trait Implementations

```rust
impl Eq for CtString
impl Hash for CtString
impl Append for CtString
```
---
title: Type
---

`std::meta::typ` contains methods on the built-in `Type` type used for representing
a type in the source program.

## Functions

#include_code fresh_type_variable noir_stdlib/src/meta/typ.nr rust

Creates and returns an unbound type variable. This is a special kind of type internal
to type checking which will type check with any other type. When it is type checked
against another type it will also be set to that type. For example, if `a` is a type
variable and we have the type equality `(a, i32) = (u8, i32)`, the compiler will set
`a` equal to `u8`.

Unbound type variables will often be rendered as `_` while printing them. Bound type
variables will appear as the type they are bound to.

This can be used in conjunction with functions which internally perform type checks
such as `Type::implements` or `Type::get_trait_impl` to potentially grab some of the types used.

Note that calling `Type::implements` or `Type::get_trait_impl` on a type variable will always
fail.

Example:

#include_code serialize-setup test_programs/compile_success_empty/comptime_type/src/main.nr rust
#include_code fresh-type-variable-example test_programs/compile_success_empty/comptime_type/src/main.nr rust

## Methods

### as_array

#include_code as_array noir_stdlib/src/meta/typ.nr rust

If this type is an array, return a pair of (element type, size type).

Example:

```rust
comptime {
    let array_type = quote { [Field; 3] }.as_type();
    let (field_type, three_type) = array_type.as_array().unwrap();

    assert(field_type.is_field());
    assert_eq(three_type.as_constant().unwrap(), 3);
}
```

### as_constant

#include_code as_constant noir_stdlib/src/meta/typ.nr rust

If this type is a constant integer (such as the `3` in the array type `[Field; 3]`),
return the numeric constant.

### as_integer

#include_code as_integer noir_stdlib/src/meta/typ.nr rust

If this is an integer type, return a boolean which is `true`
if the type is signed, as well as the number of bits of this integer type.

### as_mutable_reference

#include_code as_mutable_reference noir_stdlib/src/meta/typ.nr rust

If this is a mutable reference type `&mut T`, returns the mutable type `T`.

### as_slice

#include_code as_slice noir_stdlib/src/meta/typ.nr rust

If this is a slice type, return the element type of the slice.

### as_str

#include_code as_str noir_stdlib/src/meta/typ.nr rust

If this is a `str<N>` type, returns the length `N` as a type.

### as_struct

#include_code as_struct noir_stdlib/src/meta/typ.nr rust

If this is a struct type, returns the struct in addition to
any generic arguments on this type.

### as_tuple

#include_code as_tuple noir_stdlib/src/meta/typ.nr rust

If this is a tuple type, returns each element type of the tuple.

### get_trait_impl

#include_code get_trait_impl noir_stdlib/src/meta/typ.nr rust

Retrieves the trait implementation that implements the given
trait constraint for this type. If the trait constraint is not
found, `None` is returned. Note that since the concrete trait implementation
for a trait constraint specified in a `where` clause is unknown,
this function will return `None` in these cases. If you only want to know
whether a type implements a trait, use `implements` instead.

Example:

```rust
comptime {
    let field_type = quote { Field }.as_type();
    let default = quote { Default }.as_trait_constraint();

    let the_impl: TraitImpl = field_type.get_trait_impl(default).unwrap();
    assert(the_impl.methods().len(), 1);
}
```

### implements

#include_code implements noir_stdlib/src/meta/typ.nr rust

`true` if this type implements the given trait. Note that unlike
`get_trait_impl` this will also return true for any `where` constraints
in scope.

Example:

```rust
fn foo<T>() where T: Default {
    comptime {
        let field_type = quote { Field }.as_type();
        let default = quote { Default }.as_trait_constraint();
        assert(field_type.implements(default));

        let t = quote { T }.as_type();
        assert(t.implements(default));
    }
}
```

### is_bool

#include_code is_bool noir_stdlib/src/meta/typ.nr rust

`true` if this type is `bool`.

### is_field

#include_code is_field noir_stdlib/src/meta/typ.nr rust

`true` if this type is `Field`.

### is_unit

#include_code is_unit noir_stdlib/src/meta/typ.nr rust

`true` if this type is the unit `()` type.

## Trait Implementations

```rust
impl Eq for Type
impl Hash for Type
```
Note that this is syntactic equality, this is not the same as whether two types will type check
to be the same type. Unless type inference or generics are being used however, users should not
typically have to worry about this distinction unless `std::meta::typ::fresh_type_variable` is used.
---
title: UnresolvedType
---

`std::meta::unresolved_type` contains methods on the built-in `UnresolvedType` type for the syntax of types.

## Methods

### as_mutable_reference

#include_code as_mutable_reference noir_stdlib/src/meta/unresolved_type.nr rust

If this is a mutable reference type `&mut T`, returns the mutable type `T`.

### as_slice

#include_code as_slice noir_stdlib/src/meta/unresolved_type.nr rust

If this is a slice `&[T]`, returns the element type `T`.

### is_bool

#include_code is_bool noir_stdlib/src/meta/unresolved_type.nr rust

Returns `true` if this type is `bool`.

### is_field

#include_code is_field noir_stdlib/src/meta/unresolved_type.nr rust

Returns true if this type refers to the Field type.

### is_unit

#include_code is_unit noir_stdlib/src/meta/unresolved_type.nr rust

Returns true if this type is the unit `()` type.
---
title: Quoted
---

`std::meta::quoted` contains methods on the built-in `Quoted` type which represents
quoted token streams and is the result of the `quote { ... }` expression.

## Methods

### as_expr

#include_code as_expr noir_stdlib/src/meta/quoted.nr rust

Parses the quoted token stream as an expression. Returns `Option::none()` if
the expression failed to parse.

Example:

#include_code as_expr_example test_programs/noir_test_success/comptime_expr/src/main.nr rust

### as_module

#include_code as_module noir_stdlib/src/meta/quoted.nr rust

Interprets this token stream as a module path leading to the name of a module.
Returns `Option::none()` if the module isn't found or this token stream cannot be parsed as a path.

Example:

#include_code as_module_example test_programs/compile_success_empty/comptime_module/src/main.nr rust

### as_trait_constraint

#include_code as_trait_constraint noir_stdlib/src/meta/quoted.nr rust

Interprets this token stream as a trait constraint (without an object type).
Note that this function panics instead of returning `Option::none()` if the token
stream does not parse and resolve to a valid trait constraint.

Example:

#include_code implements_example test_programs/compile_success_empty/comptime_type/src/main.nr rust

### as_type

#include_code as_type noir_stdlib/src/meta/quoted.nr rust

Interprets this token stream as a resolved type. Panics if the token
stream doesn't parse to a type or if the type isn't a valid type in scope.

#include_code implements_example test_programs/compile_success_empty/comptime_type/src/main.nr rust

### tokens

#include_code tokens noir_stdlib/src/meta/quoted.nr rust

Returns a slice of the individual tokens that form this token stream.

## Trait Implementations

```rust
impl Eq for Quoted
impl Hash for Quoted
```
---
title: StructDefinition
---

`std::meta::struct_def` contains methods on the built-in `StructDefinition` type.
This type corresponds to `struct Name { field1: Type1, ... }` items in the source program.

## Methods

### add_attribute

#include_code add_attribute noir_stdlib/src/meta/struct_def.nr rust

Adds an attribute to the struct.

### add_generic

#include_code add_generic noir_stdlib/src/meta/struct_def.nr rust

Adds an generic to the struct. Returns the new generic type.
Errors if the given generic name isn't a single identifier or if
the struct already has a generic with the same name.

This method should be used carefully, if there is existing code referring
to the struct type it may be checked before this function is called and
see the struct with the original number of generics. This method should
thus be preferred to use on code generated from other macros and structs
that are not used in function signatures.

Example:

#include_code add-generic-example test_programs/compile_success_empty/comptime_struct_definition/src/main.nr rust

### as_type

#include_code as_type noir_stdlib/src/meta/struct_def.nr rust

Returns this struct as a type in the source program. If this struct has
any generics, the generics are also included as-is.

### generics

#include_code generics noir_stdlib/src/meta/struct_def.nr rust

Returns each generic on this struct.

Example:

```
#[example]
struct Foo<T, U> {
    bar: [T; 2],
    baz: Baz<U, U>,
}

comptime fn example(foo: StructDefinition) {
    assert_eq(foo.generics().len(), 2);

    // Fails because `T` isn't in scope
    // let t = quote { T }.as_type();
    // assert_eq(foo.generics()[0], t);
}
```

### fields

#include_code fields noir_stdlib/src/meta/struct_def.nr rust

Returns each field of this struct as a pair of (field name, field type).

### has_named_attribute

#include_code has_named_attribute noir_stdlib/src/meta/struct_def.nr rust

Returns true if this struct has a custom attribute with the given name.

### module

#include_code module noir_stdlib/src/meta/struct_def.nr rust

Returns the module where the struct is defined.

### name

#include_code name noir_stdlib/src/meta/struct_def.nr rust

Returns the name of this struct

Note that the returned quoted value will be just the struct name, it will
not be the full path to the struct, nor will it include any generics.

### set_fields

#include_code set_fields noir_stdlib/src/meta/struct_def.nr rust

Sets the fields of this struct to the given fields list where each element
is a pair of the field's name and the field's type. Expects each field name
to be a single identifier. Note that this will override any previous fields
on this struct. If those should be preserved, use `.fields()` to retrieve the
current fields on the struct type and append the new fields from there.

Example:

```rust
// Change this struct to:
// struct Foo {
//     a: u32,
//     b: i8,
// }
#[mangle_fields]
struct Foo { x: Field }

comptime fn mangle_fields(s: StructDefinition) {
    s.set_fields(&[
        (quote { a }, quote { u32 }.as_type()),
        (quote { b }, quote { i8 }.as_type()),
    ]);
}
```

## Trait Implementations

```rust
impl Eq for StructDefinition
impl Hash for StructDefinition
```

Note that each struct is assigned a unique ID internally and this is what is used for
equality and hashing. So even structs with identical generics and fields may not
be equal in this sense if they were originally different items in the source program.
---
title: TypedExpr
---

`std::meta::typed_expr` contains methods on the built-in `TypedExpr` type for resolved and type-checked expressions.

## Methods

### get_type

#include_code as_function_definition noir_stdlib/src/meta/typed_expr.nr rust

If this expression refers to a function definitions, returns it. Otherwise returns `Option::none()`.

### get_type

#include_code get_type noir_stdlib/src/meta/typed_expr.nr rust

Returns the type of the expression, or `Option::none()` if there were errors when the expression was previously resolved.---
title: Module
---

`std::meta::module` contains methods on the built-in `Module` type which represents a module in the source program.
Note that this type represents a module generally, it isn't limited to only `mod my_submodule { ... }`
declarations in the source program.

## Methods

### add_item

#include_code add_item noir_stdlib/src/meta/module.nr rust

Adds a top-level item (a function, a struct, a global, etc.) to the module. 
Adding multiple items in one go is also valid if the `Quoted` value has multiple items in it.  
Note that the items are type-checked as if they are inside the module they are being added to.

### functions

#include_code functions noir_stdlib/src/meta/module.nr rust

Returns each function defined in the module.

### has_named_attribute

#include_code has_named_attribute noir_stdlib/src/meta/module.nr rust

Returns true if this module has a custom attribute with the given name.

### is_contract

#include_code is_contract noir_stdlib/src/meta/module.nr rust

`true` if this module is a contract module (was declared via `contract foo { ... }`).

### name

#include_code name noir_stdlib/src/meta/module.nr rust

Returns the name of the module.

### structs

#include_code structs noir_stdlib/src/meta/module.nr rust

Returns each struct defined in the module.

## Trait Implementations

```rust
impl Eq for Module
impl Hash for Module
```

Note that each module is assigned a unique ID internally and this is what is used for
equality and hashing. So even modules with identical names and contents may not
be equal in this sense if they were originally different items in the source program.
---
title: TraitDefinition
---

`std::meta::trait_def` contains methods on the built-in `TraitDefinition` type. This type
represents trait definitions such as `trait Foo { .. }` at the top-level of a program.

## Methods

### as_trait_constraint

#include_code as_trait_constraint noir_stdlib/src/meta/trait_def.nr rust

Converts this trait into a trait constraint. If there are any generics on this
trait, they will be kept as-is without instantiating or replacing them.

## Trait Implementations

```rust
impl Eq for TraitDefinition
impl Hash for TraitDefinition
```
---
title: FunctionDefinition
---

`std::meta::function_def` contains methods on the built-in `FunctionDefinition` type representing
a function definition in the source program.

## Methods

### add_attribute

#include_code add_attribute noir_stdlib/src/meta/function_def.nr rust

Adds an attribute to the function. This is only valid
on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

### body

#include_code body noir_stdlib/src/meta/function_def.nr rust

Returns the body of the function as an expression. This is only valid
on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

### has_named_attribute

#include_code has_named_attribute noir_stdlib/src/meta/function_def.nr rust

Returns true if this function has a custom attribute with the given name.

### is_unconstrained

#include_code is_unconstrained noir_stdlib/src/meta/function_def.nr rust

Returns true if this function is unconstrained.

### module

#include_code module noir_stdlib/src/meta/function_def.nr rust

Returns the module where the function is defined.

### name

#include_code name noir_stdlib/src/meta/function_def.nr rust

Returns the name of the function.

### parameters

#include_code parameters noir_stdlib/src/meta/function_def.nr rust

Returns each parameter of the function as a tuple of (parameter pattern, parameter type).

### return_type

#include_code return_type noir_stdlib/src/meta/function_def.nr rust

The return type of the function.

### set_body

#include_code set_body noir_stdlib/src/meta/function_def.nr rust

Mutate the function body to a new expression. This is only valid
on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

### set_parameters

#include_code set_parameters noir_stdlib/src/meta/function_def.nr rust

Mutates the function's parameters to a new set of parameters. This is only valid
on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

Expects a slice of (parameter pattern, parameter type) for each parameter. Requires
each parameter pattern to be a syntactically valid parameter.

### set_return_type

#include_code set_return_type noir_stdlib/src/meta/function_def.nr rust

Mutates the function's return type to a new type. This is only valid
on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

### set_return_public

#include_code set_return_public noir_stdlib/src/meta/function_def.nr rust

Mutates the function's return visibility to public (if `true` is given) or private (if `false` is given).
This is only valid on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

### set_unconstrained

#include_code set_unconstrained noir_stdlib/src/meta/function_def.nr rust

Mutates the function to be unconstrained (if `true` is given) or not (if `false` is given).
This is only valid on functions in the current crate which have not yet been resolved.
This means any functions called at compile-time are invalid targets for this method.

## Trait Implementations

```rust
impl Eq for FunctionDefinition
impl Hash for FunctionDefinition
```

Note that each function is assigned a unique ID internally and this is what is used for
equality and hashing. So even functions with identical signatures and bodies may not
be equal in this sense if they were originally different items in the source program.
---
title: UnaryOp and BinaryOp
---

`std::meta::op` contains the `UnaryOp` and `BinaryOp` types as well as methods on them.
These types are used to represent a unary or binary operator respectively in Noir source code.

## Types

### UnaryOp

Represents a unary operator. One of `-`, `!`, `&mut`, or `*`.

### Methods

#### is_minus

#include_code is_minus noir_stdlib/src/meta/op.nr rust

Returns `true` if this operator is `-`.

#### is_not

#include_code is_not noir_stdlib/src/meta/op.nr rust

`true` if this operator is `!`

#### is_mutable_reference

#include_code is_mutable_reference noir_stdlib/src/meta/op.nr rust

`true` if this operator is `&mut`

#### is_dereference

#include_code is_dereference noir_stdlib/src/meta/op.nr rust

`true` if this operator is `*`

#### quoted

#include_code unary_quoted noir_stdlib/src/meta/op.nr rust

Returns this operator as a `Quoted` value.

### Trait Implementations

```rust
impl Eq for UnaryOp
impl Hash for UnaryOp
```

### BinaryOp

Represents a binary operator. One of `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&`, `|`, `^`, `>>`, or `<<`.

### Methods

#### is_add

#include_code is_add noir_stdlib/src/meta/op.nr rust

`true` if this operator is `+`

#### is_subtract

#include_code is_subtract noir_stdlib/src/meta/op.nr rust

`true` if this operator is `-`

#### is_multiply

#include_code is_multiply noir_stdlib/src/meta/op.nr rust

`true` if this operator is `*`

#### is_divide

#include_code is_divide noir_stdlib/src/meta/op.nr rust

`true` if this operator is `/`

#### is_modulo

#include_code is_modulo noir_stdlib/src/meta/op.nr rust

`true` if this operator is `%`

#### is_equal

#include_code is_equal noir_stdlib/src/meta/op.nr rust

`true` if this operator is `==`

#### is_not_equal

#include_code is_not_equal noir_stdlib/src/meta/op.nr rust

`true` if this operator is `!=`

#### is_less_than

#include_code is_less_than noir_stdlib/src/meta/op.nr rust

`true` if this operator is `<`

#### is_less_than_or_equal

#include_code is_less_than_or_equal noir_stdlib/src/meta/op.nr rust

`true` if this operator is `<=`

#### is_greater_than

#include_code is_greater_than noir_stdlib/src/meta/op.nr rust

`true` if this operator is `>`

#### is_greater_than_or_equal

#include_code is_greater_than_or_equal noir_stdlib/src/meta/op.nr rust

`true` if this operator is `>=`

#### is_and

#include_code is_and noir_stdlib/src/meta/op.nr rust

`true` if this operator is `&`

#### is_or

#include_code is_or noir_stdlib/src/meta/op.nr rust

`true` if this operator is `|`

#### is_shift_right

#include_code is_shift_right noir_stdlib/src/meta/op.nr rust

`true` if this operator is `>>`

#### is_shift_left

#include_code is_shift_left noir_stdlib/src/meta/op.nr rust

`true` if this operator is `<<`

#### quoted

#include_code binary_quoted noir_stdlib/src/meta/op.nr rust

Returns this operator as a `Quoted` value.

### Trait Implementations

```rust
impl Eq for BinaryOp
impl Hash for BinaryOp
```
---
title: Expr
---

`std::meta::expr` contains methods on the built-in `Expr` type for quoted, syntactically valid expressions.

## Methods

### as_array

#include_code as_array noir_stdlib/src/meta/expr.nr rust

If this expression is an array, this returns a slice of each element in the array.

### as_assert

#include_code as_assert noir_stdlib/src/meta/expr.nr rust

If this expression is an assert, this returns the assert expression and the optional message.

### as_assert_eq

#include_code as_assert_eq noir_stdlib/src/meta/expr.nr rust

If this expression is an assert_eq, this returns the left-hand-side and right-hand-side
expressions, together with the optional message.

### as_assign

#include_code as_assign noir_stdlib/src/meta/expr.nr rust

If this expression is an assignment, this returns a tuple with the left hand side
and right hand side in order.

### as_binary_op

#include_code as_binary_op noir_stdlib/src/meta/expr.nr rust

If this expression is a binary operator operation `<lhs> <op> <rhs>`,
return the left-hand side, operator, and the right-hand side of the operation.

### as_block

#include_code as_block noir_stdlib/src/meta/expr.nr rust

If this expression is a block `{ stmt1; stmt2; ...; stmtN }`, return
a slice containing each statement.

### as_bool

#include_code as_bool noir_stdlib/src/meta/expr.nr rust

If this expression is a boolean literal, return that literal.

### as_cast

#include_code as_cast noir_stdlib/src/meta/expr.nr rust

If this expression is a cast expression (`expr as type`), returns the casted
expression and the type to cast to.

### as_comptime

#include_code as_comptime noir_stdlib/src/meta/expr.nr rust

If this expression is a `comptime { stmt1; stmt2; ...; stmtN }` block,
return each statement in the block.

### as_constructor

#include_code as_constructor noir_stdlib/src/meta/expr.nr rust

If this expression is a constructor `Type { field1: expr1, ..., fieldN: exprN }`,
return the type and the fields.

### as_for

#include_code as_for noir_stdlib/src/meta/expr.nr rust

If this expression is a for statement over a single expression, return the identifier,
the expression and the for loop body.

### as_for_range

#include_code as_for noir_stdlib/src/meta/expr.nr rust

If this expression is a for statement over a range, return the identifier,
the range start, the range end and the for loop body.

### as_function_call

#include_code as_function_call noir_stdlib/src/meta/expr.nr rust

If this expression is a function call `foo(arg1, ..., argN)`, return
the function and a slice of each argument.

### as_if

#include_code as_if noir_stdlib/src/meta/expr.nr rust

If this expression is an `if condition { then_branch } else { else_branch }`,
return the condition, then branch, and else branch. If there is no else branch,
`None` is returned for that branch instead.

### as_index

#include_code as_index noir_stdlib/src/meta/expr.nr rust

If this expression is an index into an array `array[index]`, return the
array and the index.

### as_integer

#include_code as_integer noir_stdlib/src/meta/expr.nr rust

If this expression is an integer literal, return the integer as a field
as well as whether the integer is negative (true) or not (false).

### as_lambda

#include_code as_lambda noir_stdlib/src/meta/expr.nr rust

If this expression is a lambda, returns the parameters, return type and body.

### as_let

#include_code as_let noir_stdlib/src/meta/expr.nr rust

If this expression is a let statement, returns the let pattern as an `Expr`,
the optional type annotation, and the assigned expression.

### as_member_access

#include_code as_member_access noir_stdlib/src/meta/expr.nr rust

If this expression is a member access `foo.bar`, return the struct/tuple
expression and the field. The field will be represented as a quoted value.

### as_method_call

#include_code as_method_call noir_stdlib/src/meta/expr.nr rust

If this expression is a method call `foo.bar::<generic1, ..., genericM>(arg1, ..., argN)`, return
the receiver, method name, a slice of each generic argument, and a slice of each argument.

### as_repeated_element_array

#include_code as_repeated_element_array noir_stdlib/src/meta/expr.nr rust

If this expression is a repeated element array `[elem; length]`, return
the repeated element and the length expressions.

### as_repeated_element_slice

#include_code as_repeated_element_slice noir_stdlib/src/meta/expr.nr rust

If this expression is a repeated element slice `[elem; length]`, return
the repeated element and the length expressions.

### as_slice

#include_code as_slice noir_stdlib/src/meta/expr.nr rust

If this expression is a slice literal `&[elem1, ..., elemN]`,
return each element of the slice.

### as_tuple

#include_code as_tuple noir_stdlib/src/meta/expr.nr rust

If this expression is a tuple `(field1, ..., fieldN)`,
return each element of the tuple.

### as_unary_op

#include_code as_unary_op noir_stdlib/src/meta/expr.nr rust

If this expression is a unary operation `<op> <rhs>`,
return the unary operator as well as the right-hand side expression.

### as_unsafe

#include_code as_unsafe noir_stdlib/src/meta/expr.nr rust

If this expression is an `unsafe { stmt1; ...; stmtN }` block,
return each statement inside in a slice.

### has_semicolon

#include_code has_semicolon noir_stdlib/src/meta/expr.nr rust

`true` if this expression is trailed by a semicolon. E.g.

```
comptime {
    let expr1 = quote { 1 + 2 }.as_expr().unwrap();
    let expr2 = quote { 1 + 2; }.as_expr().unwrap();

    assert(expr1.as_binary_op().is_some());
    assert(expr2.as_binary_op().is_some());

    assert(!expr1.has_semicolon());
    assert(expr2.has_semicolon());
}
```

### is_break

#include_code is_break noir_stdlib/src/meta/expr.nr rust

`true` if this expression is `break`.

### is_continue

#include_code is_continue noir_stdlib/src/meta/expr.nr rust

`true` if this expression is `continue`.

### modify

#include_code modify noir_stdlib/src/meta/expr.nr rust

Applies a mapping function to this expression and to all of its sub-expressions.
`f` will be applied to each sub-expression first, then applied to the expression itself.

This happens recursively for every expression within `self`.

For example, calling `modify` on `(&[1], &[2, 3])` with an `f` that returns `Option::some`
for expressions that are integers, doubling them, would return `(&[2], &[4, 6])`.

### quoted

#include_code quoted noir_stdlib/src/meta/expr.nr rust

Returns this expression as a `Quoted` value. It's the same as `quote { $self }`.

### resolve

#include_code resolve noir_stdlib/src/meta/expr.nr rust

Resolves and type-checks this expression and returns the result as a `TypedExpr`. 

The `in_function` argument specifies where the expression is resolved:
- If it's `none`, the expression is resolved in the function where `resolve` was called
- If it's `some`, the expression is resolved in the given function

If any names used by this expression are not in scope or if there are any type errors, 
this will give compiler errors as if the expression was written directly into 
the current `comptime` function.---
title: Merkle Trees
description: Learn about Merkle Trees in Noir with this tutorial. Explore the basics of computing a merkle root using a proof, with examples.
keywords:
  [
    Merkle trees in Noir,
    Noir programming language,
    check membership,
    computing root from leaf,
    Noir Merkle tree implementation,
    Merkle tree tutorial,
    Merkle tree code examples,
    Noir libraries,
    pedersen hash.,
  ]
---

## compute_merkle_root

Returns the root of the tree from the provided leaf and its hash path, using a [Pedersen hash](./cryptographic_primitives/hashes.mdx#pedersen_hash).

```rust
fn compute_merkle_root(leaf : Field, index : Field, hash_path: [Field]) -> Field
```

example:

```rust
/**
    // these values are for this example only
    index = "0"
    priv_key = "0x000000000000000000000000000000000000000000000000000000616c696365"
    secret = "0x1929ea3ab8d9106a899386883d9428f8256cfedb3c4f6b66bf4aa4d28a79988f"
    note_hash_path = [
    "0x1e61bdae0f027b1b2159e1f9d3f8d00fa668a952dddd822fda80dc745d6f65cc",
    "0x0e4223f3925f98934393c74975142bd73079ab0621f4ee133cee050a3c194f1a",
    "0x2fd7bb412155bf8693a3bd2a3e7581a679c95c68a052f835dddca85fa1569a40"
    ]
 */
fn main(index: Field, priv_key: Field, secret: Field, note_hash_path: [Field; 3]) {

    let pubkey = std::scalar_mul::fixed_base_embedded_curve(priv_key);
    let pubkey_x = pubkey[0];
    let pubkey_y = pubkey[1];
    let note_commitment = std::hash::pedersen(&[pubkey_x, pubkey_y, secret]);

    let root = std::merkle::compute_merkle_root(note_commitment[0], index, note_hash_path.as_slice());
    println(root);
}
```

To check merkle tree membership:

1. Include a merkle root as a program input.
2. Compute the merkle root of a given leaf, index and hash path.
3. Assert the merkle roots are equal.

For more info about merkle trees, see the Wikipedia [page](https://en.wikipedia.org/wiki/Merkle_tree).
---
title: Logging
description:
  Learn how to use the println statement for debugging in Noir with this tutorial. Understand the
  basics of logging in Noir and how to implement it in your code.
keywords:
  [
    noir logging,
    println statement,
    print statement,
    debugging in noir,
    noir std library,
    logging tutorial,
    basic logging in noir,
    noir logging implementation,
    noir debugging techniques,
    rust,
  ]
---

The standard library provides two familiar statements you can use: `println` and `print`. Despite being a limited implementation of rust's `println!` and `print!` macros, these constructs can be useful for debugging.

You can print the output of both statements in your Noir code by using the `nargo execute` command or the `--show-output` flag when using `nargo test` (provided there are print statements in your tests).

It is recommended to use `nargo execute` if you want to debug failing constraints with `println` or `print` statements. This is due to every input in a test being a constant rather than a witness, so we issue an error during compilation while we only print during execution (which comes after compilation). Neither `println`, nor `print` are callable for failed constraints caught at compile time.

Both `print` and `println` are generic functions which can work on integers, fields, strings, and even structs or expressions. Note however, that slices are currently unsupported. For example:

```rust
struct Person {
    age: Field,
    height: Field,
}

fn main(age: Field, height: Field) {
    let person = Person {
        age: age,
        height: height,
    };
    println(person);
    println(age + height);
    println("Hello world!");
}
```

You can print different types in the same statement (including strings) with a type called `fmtstr`. It can be specified in the same way as a normal string, just prepended with an "f" character:

```rust
  let fmt_str = f"i: {i}, j: {j}";
  println(fmt_str);

  let s = myStruct { y: x, x: y };
  println(s);

  println(f"i: {i}, s: {s}");

  println(x);
  println([x, y]);

  let foo = fooStruct { my_struct: s, foo: 15 };
  println(f"s: {s}, foo: {foo}");

  println(15);       // prints 0x0f, implicit Field
  println(-1 as u8); // prints 255
  println(-1 as i8); // prints -1
```

Examples shown above are interchangeable between the two `print` statements:

```rust
let person = Person { age : age, height : height };

println(person);
print(person);

println("Hello world!"); // Prints with a newline at the end of the input
print("Hello world!");   // Prints the input and keeps cursor on the same line
```
---
title: fmtstr
---

`fmtstr<N, T>` is the type resulting from using format string (`f"..."`).

## Methods

### quoted_contents

#include_code quoted_contents noir_stdlib/src/meta/format_string.nr rust

Returns the format string contents (that is, without the leading and trailing double quotes) as a `Quoted` value.---
title: Is Unconstrained Function
description:
  The is_unconstrained function returns wether the context at that point of the program is unconstrained or not.
keywords:
  [
    unconstrained
  ]
---

It's very common for functions in circuits to take unconstrained hints of an expensive computation and then verify it. This is done by running the hint in an unconstrained context and then verifying the result in a constrained context.

When a function is marked as unconstrained, any subsequent functions that it calls will also be run in an unconstrained context. However, if we are implementing a library function, other users might call it within an unconstrained context or a constrained one. Generally, in an unconstrained context we prefer just computing the result instead of taking a hint of it and verifying it, since that'd mean doing the same computation twice:

```rust 

fn my_expensive_computation(){
  ...
}

unconstrained fn my_expensive_computation_hint(){
  my_expensive_computation()
}

pub fn external_interface(){
  my_expensive_computation_hint();
  // verify my_expensive_computation: If external_interface is called from unconstrained, this is redundant
  ...
}

```

In order to improve the performance in an unconstrained context you can use the function at `std::runtime::is_unconstrained() -> bool`:


```rust 
use dep::std::runtime::is_unconstrained;

fn my_expensive_computation(){
  ...
}

unconstrained fn my_expensive_computation_hint(){
  my_expensive_computation()
}

pub fn external_interface(){
  if is_unconstrained() {
    my_expensive_computation();
  } else {
    my_expensive_computation_hint();
    // verify my_expensive_computation
    ...
  }
}

```

The is_unconstrained result is resolved at compile time, so in unconstrained contexts the compiler removes the else branch, and in constrained contexts the compiler removes the if branch, reducing the amount of compute necessary to run external_interface.

Note that using `is_unconstrained` in a `comptime` context will also return `true`:

```
fn main() {
    comptime {
        assert(is_unconstrained());
    }
}
```
---
title: Cryptographic Primitives
description:
  Learn about the cryptographic primitives ready to use for any Noir project
keywords:
  [
    cryptographic primitives,
    Noir project,
  ]
---

The Noir team is progressively adding new cryptographic primitives to the standard library. Reach out for news or if you would be interested in adding more of these calculations in Noir.

Some methods are available thanks to the Aztec backend, not being performed using Noir. When using other backends, these methods may or may not be supplied.
---
title: Scalar multiplication
description: See how you can perform scalar multiplication in Noir
keywords: [cryptographic primitives, Noir project, scalar multiplication]
sidebar_position: 1
---

import BlackBoxInfo from '@site/src/components/Notes/_blackbox';

The following functions perform operations over the embedded curve whose coordinates are defined by the configured noir field.
For the BN254 scalar field, this is BabyJubJub or Grumpkin.

:::note
Suffixes `_low` and `_high` denote low and high limbs of a scalar.
:::

## embedded_curve_ops::multi_scalar_mul

Performs multi scalar multiplication over the embedded curve.
The function accepts arbitrary amount of point-scalar pairs on the input, it multiplies the individual pairs over
the curve and returns a sum of the resulting points.

Points represented as x and y coordinates [x1, y1, x2, y2, ...], scalars as low and high limbs [low1, high1, low2, high2, ...].

#include_code multi_scalar_mul noir_stdlib/src/embedded_curve_ops.nr rust

example

```rust
fn main(point_x: Field, point_y: Field, scalar_low: Field, scalar_high: Field) {
    let point = std::embedded_curve_ops::multi_scalar_mul([point_x, point_y], [scalar_low, scalar_high]);
    println(point);
}
```

## embedded_curve_ops::fixed_base_scalar_mul

Performs fixed base scalar multiplication over the embedded curve (multiplies input scalar with a generator point).
The function accepts a single scalar on the input represented as 2 fields.

#include_code fixed_base_scalar_mul noir_stdlib/src/embedded_curve_ops.nr rust

example

```rust
fn main(scalar_low: Field, scalar_high: Field) {
    let point = std::embedded_curve_ops::fixed_base_scalar_mul(scalar_low, scalar_high);
    println(point);
}
```

## embedded_curve_ops::embedded_curve_add

Adds two points on the embedded curve.
This function takes two `EmbeddedCurvePoint` structures as parameters, representing points on the curve, and returns a new `EmbeddedCurvePoint` structure that represents their sum.

### Parameters:
- `point1` (`EmbeddedCurvePoint`): The first point to add.
- `point2` (`EmbeddedCurvePoint`): The second point to add.

### Returns:
- `EmbeddedCurvePoint`: The resulting point after the addition of `point1` and `point2`.

#include_code embedded_curve_add noir_stdlib/src/embedded_curve_ops.nr rust

example

```rust
fn main() {
    let point1 = EmbeddedCurvePoint { x: 1, y: 2 };
    let point2 = EmbeddedCurvePoint { x: 3, y: 4 };
    let result = std::embedded_curve_ops::embedded_curve_add(point1, point2);
    println!("Resulting Point: ({}, {})", result.x, result.y);
}
```

<BlackBoxInfo to="../black_box_fns"/>
---
title: Hash methods
description:
  Learn about the cryptographic primitives ready to use for any Noir project, including sha256,
  blake2s and pedersen
keywords:
  [cryptographic primitives, Noir project, sha256, blake2s, pedersen, hash]
sidebar_position: 0
---

import BlackBoxInfo from '@site/src/components/Notes/_blackbox';

## sha256

Given an array of bytes, returns the resulting sha256 hash.
Specify a message_size to hash only the first `message_size` bytes of the input.

#include_code sha256 noir_stdlib/src/hash/sha256.nr rust

example:
#include_code sha256_var test_programs/execution_success/sha256/src/main.nr rust

```rust
fn main() {
    let x = [163, 117, 178, 149]; // some random bytes
    let hash = std::sha256::sha256_var(x, 4);
}
```


<BlackBoxInfo to="../black_box_fns"/>

## blake2s

Given an array of bytes, returns an array with the Blake2 hash

#include_code blake2s noir_stdlib/src/hash/mod.nr rust

example:

```rust
fn main() {
    let x = [163, 117, 178, 149]; // some random bytes
    let hash = std::hash::blake2s(x);
}
```

<BlackBoxInfo to="../black_box_fns"/>

## blake3

Given an array of bytes, returns an array with the Blake3 hash

#include_code blake3 noir_stdlib/src/hash/mod.nr rust

example:

```rust
fn main() {
    let x = [163, 117, 178, 149]; // some random bytes
    let hash = std::hash::blake3(x);
}
```

<BlackBoxInfo to="../black_box_fns"/>

## pedersen_hash

Given an array of Fields, returns the Pedersen hash.

#include_code pedersen_hash noir_stdlib/src/hash/mod.nr rust

example:

#include_code pedersen-hash test_programs/execution_success/pedersen_hash/src/main.nr rust

<BlackBoxInfo to="../black_box_fns" />

## pedersen_commitment

Given an array of Fields, returns the Pedersen commitment.

#include_code pedersen_commitment noir_stdlib/src/hash/mod.nr rust

example:

#include_code pedersen-commitment test_programs/execution_success/pedersen_commitment/src/main.nr rust

<BlackBoxInfo to="../black_box_fns"/>

## keccak256

Given an array of bytes (`u8`), returns the resulting keccak hash as an array of
32 bytes (`[u8; 32]`). Specify a message_size to hash only the first
`message_size` bytes of the input.

#include_code keccak256 noir_stdlib/src/hash/mod.nr rust

example:

#include_code keccak256 test_programs/execution_success/keccak256/src/main.nr rust

<BlackBoxInfo to="../black_box_fns"/>

## poseidon

Given an array of Fields, returns a new Field with the Poseidon Hash. Mind that you need to specify
how many inputs are there to your Poseidon function.

```rust
// example for hash_1, hash_2 accepts an array of length 2, etc
fn hash_1(input: [Field; 1]) -> Field
```

example:

#include_code poseidon test_programs/execution_success/poseidon_bn254_hash/src/main.nr rust

## poseidon 2

Given an array of Fields, returns a new Field with the Poseidon2 Hash. Contrary to the Poseidon
function, there is only one hash and you can specify a message_size to hash only the first 
`message_size` bytes of the input,

```rust
// example for hashing the first three elements of the input
Poseidon2::hash(input, 3);
```

example:

#include_code poseidon2 test_programs/execution_success/poseidon2/src/main.nr rust

## hash_to_field

```rust
fn hash_to_field(_input : [Field]) -> Field {}
```

Calculates the `blake2s` hash of the inputs and returns the hash modulo the field modulus to return
a value which can be represented as a `Field`.

---
title: Ciphers
description:
  Learn about the implemented ciphers ready to use for any Noir project
keywords:
  [ciphers, Noir project, aes128, encrypt]
sidebar_position: 0
---

import BlackBoxInfo from '@site/src/components/Notes/_blackbox';

## aes128

Given a plaintext as an array of bytes, returns the corresponding aes128 ciphertext (CBC mode). Input padding is automatically performed using PKCS#7, so that the output length is `input.len() + (16 - input.len() % 16)`.

#include_code aes128 noir_stdlib/src/aes128.nr rust

```rust
fn main() {
    let input: [u8; 4] = [0, 12, 3, 15] // Random bytes, will be padded to 16 bytes.
    let iv: [u8; 16] = [0; 16]; // Initialisation vector
    let key: [u8; 16] = [0; 16] // AES key
    let ciphertext = std::aes128::aes128_encrypt(inputs.as_bytes(), iv.as_bytes(), key.as_bytes()); // In this case, the output length will be 16 bytes.
}
```


<BlackBoxInfo to="../black_box_fns"/>---
title: ECDSA Signature Verification
description: Learn about the cryptographic primitives regarding ECDSA over the secp256k1 and secp256r1 curves
keywords: [cryptographic primitives, Noir project, ecdsa, secp256k1, secp256r1, signatures]
sidebar_position: 3
---

import BlackBoxInfo from '@site/src/components/Notes/_blackbox';

Noir supports ECDSA signatures verification over the secp256k1 and secp256r1 curves.

## ecdsa_secp256k1::verify_signature

Verifier for ECDSA Secp256k1 signatures.
See ecdsa_secp256k1::verify_signature_slice for a version that accepts slices directly.

#include_code ecdsa_secp256k1 noir_stdlib/src/ecdsa_secp256k1.nr rust

example:

```rust
fn main(hashed_message : [u8;32], pub_key_x : [u8;32], pub_key_y : [u8;32], signature : [u8;64]) {
     let valid_signature = std::ecdsa_secp256k1::verify_signature(pub_key_x, pub_key_y, signature, hashed_message);
     assert(valid_signature);
}
```

<BlackBoxInfo to="../black_box_fns" />

## ecdsa_secp256k1::verify_signature_slice

Verifier for ECDSA Secp256k1 signatures where the message is a slice.

#include_code ecdsa_secp256k1_slice noir_stdlib/src/ecdsa_secp256k1.nr rust

<BlackBoxInfo to="../black_box_fns"/>

## ecdsa_secp256r1::verify_signature

Verifier for ECDSA Secp256r1 signatures.
See ecdsa_secp256r1::verify_signature_slice for a version that accepts slices directly.

#include_code ecdsa_secp256r1 noir_stdlib/src/ecdsa_secp256r1.nr rust

example:

```rust
fn main(hashed_message : [u8;32], pub_key_x : [u8;32], pub_key_y : [u8;32], signature : [u8;64]) {
     let valid_signature = std::ecdsa_secp256r1::verify_signature(pub_key_x, pub_key_y, signature, hashed_message);
     assert(valid_signature);
}
```

<BlackBoxInfo to="../black_box_fns"/>

## ecdsa_secp256r1::verify_signature

Verifier for ECDSA Secp256r1 signatures where the message is a slice.

#include_code ecdsa_secp256r1_slice noir_stdlib/src/ecdsa_secp256r1.nr rust

<BlackBoxInfo to="../black_box_fns"/>
---
title: Recursive Proofs
description: Learn about how to write recursive proofs in Noir.
keywords: [recursion, recursive proofs, verification_key, verify_proof]
---

import BlackBoxInfo from '@site/src/components/Notes/_blackbox';

Noir supports recursively verifying proofs, meaning you verify the proof of a Noir program in another Noir program. This enables creating proofs of arbitrary size by doing step-wise verification of smaller components of a large proof.

Read [the explainer on recursion](../../explainers/explainer-recursion.md) to know more about this function and the [guide on how to use it.](../../how_to/how-to-recursion.md)

## Verifying Recursive Proofs

```rust
#[foreign(recursive_aggregation)]
pub fn verify_proof(verification_key: [Field], proof: [Field], public_inputs: [Field], key_hash: Field) {}
```

<BlackBoxInfo to="black_box_fns"/>

## Example usage

```rust

fn main(
    verification_key : [Field; 114],
    proof : [Field; 93],
    public_inputs : [Field; 1],
    key_hash : Field,
    proof_b : [Field; 93],
) {
    std::verify_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash
    );

    std::verify_proof(
        verification_key,
        proof_b,
        public_inputs,
        key_hash
    );
}
```

You can see a full example of recursive proofs in [this example recursion demo repo](https://github.com/noir-lang/noir-examples/tree/master/recursion).

## Parameters

### `verification_key`

The verification key for the zk program that is being verified.

### `proof`

The proof for the zk program that is being verified.

### `public_inputs`

These represent the public inputs of the proof we are verifying.

### `key_hash`

A key hash is used to check the validity of the verification key. The circuit implementing this opcode can use this hash to ensure that the key provided to the circuit matches the key produced by the circuit creator.
---
title: Memory Module
description:
  This module contains functions which manipulate memory in a low-level way
keywords:
  [
    mem, memory, zeroed, transmute, checked_transmute
  ]
---

# `std::mem::zeroed`

```rust
fn zeroed<T>() -> T
```

Returns a zeroed value of any type.
This function is generally unsafe to use as the zeroed bit pattern is not guaranteed to be valid for all types.
It can however, be useful in cases when the value is guaranteed not to be used such as in a BoundedVec library implementing a growable vector, up to a certain length, backed by an array.
The array can be initialized with zeroed values which are guaranteed to be inaccessible until the vector is pushed to.
Similarly, enumerations in noir can be implemented using this method by providing zeroed values for the unused variants.

This function currently supports the following types:

- Field
- Bool
- Uint
- Array
- Slice
- String
- Tuple
- Functions
  
Using it on other types could result in unexpected behavior.

# `std::mem::checked_transmute`

```rust
fn checked_transmute<T, U>(value: T) -> U
```

Transmutes a value of one type into the same value but with a new type `U`.

This function is safe to use since both types are asserted to be equal later during compilation after the concrete values for generic types become known.
This function is useful for cases where the compiler may fail a type check that is expected to pass where
a user knows the two types to be equal. For example, when using arithmetic generics there are cases the compiler
does not see as equal, such as `[Field; N*(A + B)]` and `[Field; N*A + N*B]`, which users may know to be equal.
In these cases, `checked_transmute` can be used to cast the value to the desired type while also preserving safety
by checking this equality once `N`, `A`, `B` are fully resolved.

Note that since this safety check is performed after type checking rather than during, no error is issued if the function
containing `checked_transmute` is never called.

# `std::mem::array_refcount`

```rust
fn array_refcount<T, let N: u32>(array: [T; N]) -> u32 {}
```

Returns the internal reference count of an array value in unconstrained code.

Arrays only have reference count in unconstrained code - using this anywhere
else will return zero.

This function is mostly intended for debugging compiler optimizations but can also be used
to find where array copies may be happening in unconstrained code by placing it before array
mutations.

# `std::mem::slice_refcount`

```rust
fn slice_refcount<T>(slice: [T]) -> u32 {}
```

Returns the internal reference count of a slice value in unconstrained code.

Slices only have reference count in unconstrained code - using this anywhere
else will return zero.

This function is mostly intended for debugging compiler optimizations but can also be used
to find where slice copies may be happening in unconstrained code by placing it before slice
mutations.
---
title: Unconstrained Functions
description: "Learn about what unconstrained functions in Noir are, how to use them and when you'd want to."

keywords: [Noir programming language, unconstrained, open]
sidebar_position: 5
---

Unconstrained functions are functions which do not constrain any of the included computation and allow for non-deterministic computation.

## Why?

Zero-knowledge (ZK) domain-specific languages (DSL) enable developers to generate ZK proofs from their programs by compiling code down to the constraints of an NP complete language (such as R1CS or PLONKish languages). However, the hard bounds of a constraint system can be very limiting to the functionality of a ZK DSL.

Enabling a circuit language to perform unconstrained execution is a powerful tool. Said another way, unconstrained execution lets developers generate witnesses from code that does not generate any constraints. Being able to execute logic outside of a circuit is critical for both circuit performance and constructing proofs on information that is external to a circuit.

Fetching information from somewhere external to a circuit can also be used to enable developers to improve circuit efficiency.

A ZK DSL does not just prove computation, but proves that some computation was handled correctly. Thus, it is necessary that when we switch from performing some operation directly inside of a circuit to inside of an unconstrained environment that the appropriate constraints are still laid down elsewhere in the circuit.

## Example

An in depth example might help drive the point home. This example comes from the excellent [post](https://discord.com/channels/1113924620781883405/1124022445054111926/1128747641853972590) by Tom in the Noir Discord.

Let's look at how we can optimize a function to turn a `u72` into an array of `u8`s.

```rust
fn main(num: u72) -> pub [u8; 8] {
    let mut out: [u8; 8] = [0; 8];
    for i in 0..8 {
        out[i] = (num >> (56 - (i * 8)) as u72 & 0xff) as u8;
    }

    out
}
```

```
Total ACIR opcodes generated for language PLONKCSat { width: 3 }: 91
Backend circuit size: 3619
```

A lot of the operations in this function are optimized away by the compiler (all the bit-shifts turn into divisions by constants). However we can save a bunch of gates by casting to u8 a bit earlier. This automatically truncates the bit-shifted value to fit in a u8 which allows us to remove the AND against 0xff. This saves us ~480 gates in total.

```rust
fn main(num: u72) -> pub [u8; 8] {
    let mut out: [u8; 8] = [0; 8];
    for i in 0..8 {
        out[i] = (num >> (56 - (i * 8)) as u8;
    }

    out
}
```

```
Total ACIR opcodes generated for language PLONKCSat { width: 3 }: 75
Backend circuit size: 3143
```

Those are some nice savings already but we can do better. This code is all constrained so we're proving every step of calculating out using num, but we don't actually care about how we calculate this, just that it's correct. This is where brillig comes in.

It turns out that truncating a u72 into a u8 is hard to do inside a snark, each time we do as u8 we lay down 4 ACIR opcodes which get converted into multiple gates. It's actually much easier to calculate num from out than the other way around. All we need to do is multiply each element of out by a constant and add them all together, both relatively easy operations inside a snark.

We can then run `u72_to_u8` as unconstrained brillig code in order to calculate out, then use that result in our constrained function and assert that if we were to do the reverse calculation we'd get back num. This looks a little like the below:

```rust
fn main(num: u72) -> pub [u8; 8] {
    /// Safety: 'out' is properly constrained below in 'assert(num == reconstructed_num);'
    let out = unsafe { u72_to_u8(num) };

    let mut reconstructed_num: u72 = 0;
    for i in 0..8 {
        reconstructed_num += (out[i] as u72 << (56 - (8 * i)));
    }
    assert(num == reconstructed_num);
    out
}

unconstrained fn u72_to_u8(num: u72) -> [u8; 8] {
    let mut out: [u8; 8] = [0; 8];
    for i in 0..8 {
        out[i] = (num >> (56 - (i * 8))) as u8;
    }
    out
}
```

```
Total ACIR opcodes generated for language PLONKCSat { width: 3 }: 78
Backend circuit size: 2902
```

This ends up taking off another ~250 gates from our circuit! We've ended up with more ACIR opcodes than before but they're easier for the backend to prove (resulting in fewer gates).

Note that in order to invoke unconstrained functions we need to wrap them in an `unsafe` block,
to make it clear that the call is unconstrained.
Furthermore, a warning is emitted unless the `unsafe` block is documented with a `/// Safety: ...` doc comment explaining why it is fine to call the unconstrained function. Note that either the `unsafe` block can be documented this way or the statement it exists in (like in the `let` example above).

Generally we want to use brillig whenever there's something that's easy to verify but hard to compute within the circuit. For example, if you wanted to calculate a square root of a number it'll be a much better idea to calculate this in brillig and then assert that if you square the result you get back your number.

## Break and Continue

In addition to loops over runtime bounds, `break` and `continue` are also available in unconstrained code. See [break and continue](../concepts/control_flow.md#break-and-continue)
---
title: Assert Function
description:
  Learn about the `assert` and `static_assert` functions in Noir, which can be used to explicitly
  constrain the predicate or comparison expression that follows to be true, and what happens if
  the expression is false at runtime or compile-time, respectively.
keywords: [Noir programming language, assert statement, predicate expression, comparison expression]
sidebar_position: 4
---

Noir includes a special `assert` function which will explicitly constrain the predicate/comparison
expression that follows to be true. If this expression is false at runtime, the program will fail to
be proven. Example:

```rust
fn main(x : Field, y : Field) {
    assert(x == y);
}
```

> Assertions only work for predicate operations, such as `==`. If there's any ambiguity on the operation, the program will fail to compile. For example, it is unclear if `assert(x + y)` would check for `x + y == 0` or simply would return `true`.

You can optionally provide a message to be logged when the assertion fails:

```rust
assert(x == y, "x and y are not equal");
```

Aside string literals, the optional message can be a format string or any other type supported as input for Noir's [print](../standard_library/logging.md) functions. This feature lets you incorporate runtime variables into your failed assertion logs:

```rust
assert(x == y, f"Expected x == y, but got {x} == {y}");
```

Using a variable as an assertion message directly:

```rust
struct myStruct {
  myField: Field
}

let s = myStruct { myField: y };
assert(s.myField == x, s);
```

There is also a special `static_assert` function that behaves like `assert`,
but that runs at compile-time.

```rust
fn main(xs: [Field; 3]) {
    let x = 2 + 2;
    let y = 4;
    static_assert(x == y, "expected 2 + 2 to equal 4");

    // This passes since the length of `xs` is known at compile-time
    static_assert(xs.len() == 3, "expected the input to have 3 elements");
}
```

This function fails when passed a dynamic (run-time) argument:

```rust
fn main(x : Field, y : Field) {
    // this fails because `x` is not known at compile-time
    static_assert(x == 2, "expected x to be known at compile-time and equal to 2");

    let mut example_slice = &[];
    if y == 4 {
        example_slice = example_slice.push_back(0);
    }

    // This fails because the length of `example_slice` is not known at
    // compile-time
    let error_message = "expected an empty slice, known at compile-time";
    static_assert(example_slice.len() == 0, error_message);
}
```

---
title: Control Flow
description:
  Learn how to use loops and if expressions in the Noir programming language. Discover the syntax
  and examples for for loops and if-else statements.
keywords: [Noir programming language, loops, for loop, if-else statements, Rust syntax]
sidebar_position: 2
---

## If Expressions

Noir supports `if-else` statements. The syntax is most similar to Rust's where it is not required
for the statement's conditional to be surrounded by parentheses.

```rust
let a = 0;
let mut x: u32 = 0;

if a == 0 {
    if a != 0 {
        x = 6;
    } else {
        x = 2;
    }
} else {
    x = 5;
    assert(x == 5);
}
assert(x == 2);
```

## Loops

Noir has one kind of loop: the `for` loop. `for` loops allow you to repeat a block of code multiple
times.

The following block of code between the braces is run 10 times.

```rust
for i in 0..10 {
    // do something
}
```

Alternatively, `start..=end` can be used for a range that is inclusive on both ends.

The index for loops is of type `u64`.

### Break and Continue

In unconstrained code, `break` and `continue` are also allowed in `for` loops. These are only allowed
in unconstrained code since normal constrained code requires that Noir knows exactly how many iterations
a loop may have. `break` and `continue` can be used like so:

```rust
for i in 0 .. 10 {
    println("Iteration start")

    if i == 2 {
        continue;
    }

    if i == 5 {
        break;
    }

    println(i);
}
println("Loop end")
```

When used, `break` will end the current loop early and jump to the statement after the for loop. In the example
above, the `break` will stop the loop and jump to the `println("Loop end")`.

`continue` will stop the current iteration of the loop, and jump to the start of the next iteration. In the example
above, `continue` will jump to `println("Iteration start")` when used. Note that the loop continues as normal after this.
The iteration variable `i` is still increased by one as normal when `continue` is used.

`break` and `continue` cannot currently be used to jump out of more than a single loop at a time.
---
title: Traits
description:
  Traits in Noir can be used to abstract out a common interface for functions across
  several data types.
keywords: [noir programming language, traits, interfaces, generic, protocol]
sidebar_position: 14
---

## Overview

Traits in Noir are a useful abstraction similar to interfaces or protocols in other languages. Each trait defines
the interface of several methods contained within the trait. Types can then implement this trait by providing
implementations for these methods. For example in the program:

```rust
struct Rectangle {
    width: Field,
    height: Field,
}

impl Rectangle {
    fn area(self) -> Field {
        self.width * self.height
    }
}

fn log_area(r: Rectangle) {
    println(r.area());
}
```

We have a function `log_area` to log the area of a `Rectangle`. Now how should we change the program if we want this
function to work on `Triangle`s as well?:

```rust
struct Triangle {
    width: Field,
    height: Field,
}

impl Triangle {
    fn area(self) -> Field {
        self.width * self.height / 2
    }
}
```

Making `log_area` generic over all types `T` would be invalid since not all types have an `area` method. Instead, we can
introduce a new `Area` trait and make `log_area` generic over all types `T` that implement `Area`:

```rust
trait Area {
    fn area(self) -> Field;
}

fn log_area<T>(shape: T) where T: Area {
    println(shape.area());
}
```

We also need to explicitly implement `Area` for `Rectangle` and `Triangle`. We can do that by changing their existing
impls slightly. Note that the parameter types and return type of each of our `area` methods must match those defined
by the `Area` trait.

```rust
impl Area for Rectangle {
    fn area(self) -> Field {
        self.width * self.height
    }
}

impl Area for Triangle {
    fn area(self) -> Field {
        self.width * self.height / 2
    }
}
```

Now we have a working program that is generic over any type of Shape that is used! Others can even use this program
as a library with their own types - such as `Circle` - as long as they also implement `Area` for these types.

## Where Clauses

As seen in `log_area` above, when we want to create a function or method that is generic over any type that implements
a trait, we can add a where clause to the generic function.

```rust
fn log_area<T>(shape: T) where T: Area {
    println(shape.area());
}
```

It is also possible to apply multiple trait constraints on the same variable at once by combining traits with the `+`
operator. Similarly, we can have multiple trait constraints by separating each with a comma:

```rust
fn foo<T, U>(elements: [T], thing: U) where
    T: Default + Add + Eq,
    U: Bar,
{
    let mut sum = T::default();

    for element in elements {
        sum += element;
    }

    if sum == T::default() {
        thing.bar();
    }
}
```

## Generic Implementations

You can add generics to a trait implementation by adding the generic list after the `impl` keyword:

```rust
trait Second {
    fn second(self) -> Field;
}

impl<T> Second for (T, Field) {
    fn second(self) -> Field {
        self.1
    }
}
```

You can also implement a trait for every type this way:

```rust
trait Debug {
    fn debug(self);
}

impl<T> Debug for T {
    fn debug(self) {
        println(self);
    }
}

fn main() {
    1.debug();
}
```

### Generic Trait Implementations With Where Clauses

Where clauses can be placed on trait implementations themselves to restrict generics in a similar way.
For example, while `impl<T> Foo for T` implements the trait `Foo` for every type, `impl<T> Foo for T where T: Bar`
will implement `Foo` only for types that also implement `Bar`. This is often used for implementing generic types.
For example, here is the implementation for array equality:

```rust
impl<T, let N: u32> Eq for [T; let N: u32] where T: Eq {
    // Test if two arrays have the same elements.
    // Because both arrays must have length N, we know their lengths already match.
    fn eq(self, other: Self) -> bool {
        let mut result = true;

        for i in 0 .. self.len() {
            // The T: Eq constraint is needed to call == on the array elements here
            result &= self[i] == other[i];
        }

        result
    }
}
```

Where clauses can also be placed on struct implementations. 
For example, here is a method utilizing a generic type that implements the equality trait.

```rust
struct Foo<T> {
    a: u32,
    b: T,
}

impl<T> Foo<T> where T: Eq {
    fn eq(self, other: Self) -> bool {
        (self.a == other.a) & self.b.eq(other.b)
    }
}
```

## Generic Traits

Traits themselves can also be generic by placing the generic arguments after the trait name. These generics are in
scope of every item within the trait.

```rust
trait Into<T> {
    // Convert `self` to type `T`
    fn into(self) -> T;
}
```

When implementing generic traits the generic arguments of the trait must be specified. This is also true anytime
when referencing a generic trait (e.g. in a `where` clause).

```rust
struct MyStruct {
    array: [Field; 2],
}

impl Into<[Field; 2]> for MyStruct {
    fn into(self) -> [Field; 2] {
        self.array
    }
}

fn as_array<T>(x: T) -> [Field; 2] 
    where T: Into<[Field; 2]>
{
    x.into()
}

fn main() {
    let array = [1, 2];
    let my_struct = MyStruct { array };

    assert_eq(as_array(my_struct), array);
}
```

### Associated Types and Constants

Traits also support associated types and constraints which can be thought of as additional generics that are referred to by name.

Here's an example of a trait with an associated type `Foo` and a constant `Bar`:

```rust
trait MyTrait {
    type Foo;

    let Bar: u32;
}
```

Now when we're implementing `MyTrait` we also have to provide values for `Foo` and `Bar`:

```rust
impl MyTrait for Field {
    type Foo = i32;

    let Bar: u32 = 11;
}
```

Since associated constants can also be used in a type position, its values are limited to only other
expression kinds allowed in numeric generics.

Note that currently all associated types and constants must be explicitly specified in a trait constraint.
If we leave out any, we'll get an error that we're missing one:

```rust
// Error! Constraint is missing associated constant for `Bar`
fn foo<T>(x: T) where T: MyTrait<Foo = i32> {
    ...
}
```

Because all associated types and constants must be explicitly specified, they are essentially named generics,
although this is set to change in the future. Future versions of Noir will allow users to elide associated types
in trait constraints similar to Rust. When this is done, you may still refer to their value with the `<Type as Trait>::AssociatedType`
syntax:

```rust
// Only valid in future versions of Noir:
fn foo<T>(x: T) where T: MyTrait {
    let _: <T as MyTrait>::Foo = ...;
}
```

The type as trait syntax is possible in Noir today but is less useful when each type must be explicitly specified anyway:

```rust
fn foo<T, F, let B: u32>(x: T) where T: MyTrait<Foo = F, Bar = B> {
    // Works, but could just use F directly
    let _: <T as MyTrait<Foo = F, Bar = B>>::Foo = ...;

    let _: F = ...;
}
```

## Trait Methods With No `self`

A trait can contain any number of methods, each of which have access to the `Self` type which represents each type
that eventually implements the trait. Similarly, the `self` variable is available as well but is not required to be used.
For example, we can define a trait to create a default value for a type. This trait will need to return the `Self` type
but doesn't need to take any parameters:

```rust
trait Default {
    fn default() -> Self;
}
```

Implementing this trait can be done similarly to any other trait:

```rust
impl Default for Field {
    fn default() -> Field {
        0
    }
}

struct MyType {}

impl Default for MyType {
    fn default() -> Field {
        MyType {}
    }
}
```

However, since there is no `self` parameter, we cannot call it via the method call syntax `object.method()`.
Instead, we'll need to refer to the function directly. This can be done either by referring to the
specific impl `MyType::default()` or referring to the trait itself `Default::default()`. In the later
case, type inference determines the impl that is selected.

```rust
let my_struct = MyStruct::default();

let x: Field = Default::default();
let result = x + Default::default();
```

:::warning

```rust
let _ = Default::default();
```

If type inference cannot select which impl to use because of an ambiguous `Self` type, an impl will be
arbitrarily selected. This occurs most often when the result of a trait function call with no parameters
is unused. To avoid this, when calling a trait function with no `self` or `Self` parameters or return type,
always refer to it via the implementation type's namespace - e.g. `MyType::default()`.
This is set to change to an error in future Noir versions.

:::

## Default Method Implementations

A trait can also have default implementations of its methods by giving a body to the desired functions.
Note that this body must be valid for all types that may implement the trait. As a result, the only
valid operations on `self` will be operations valid for any type or other operations on the trait itself.

```rust
trait Numeric {
    fn add(self, other: Self) -> Self;

    // Default implementation of double is (self + self)
    fn double(self) -> Self {
        self.add(self)
    }
}
```

When implementing a trait with default functions, a type may choose to implement only the required functions:

```rust
impl Numeric for Field {
    fn add(self, other: Field) -> Field {
        self + other
    }
}
```

Or it may implement the optional methods as well:

```rust
impl Numeric for u32 {
    fn add(self, other: u32) -> u32 {
        self + other
    }

    fn double(self) -> u32 {
        self * 2
    }
}
```

## Impl Specialization

When implementing traits for a generic type it is possible to implement the trait for only a certain combination
of generics. This can be either as an optimization or because those specific generics are required to implement the trait.

```rust
trait Sub {
    fn sub(self, other: Self) -> Self;
}

struct NonZero<T> {
    value: T,
}

impl Sub for NonZero<Field> {
    fn sub(self, other: Self) -> Self {
        let value = self.value - other.value;
        assert(value != 0);
        NonZero { value }
    }
}
```

## Overlapping Implementations

Overlapping implementations are disallowed by Noir to ensure Noir's decision on which impl to select is never ambiguous.
This means if a trait `Foo` is already implemented
by a type `Bar<T>` for all `T`, then we cannot also have a separate impl for `Bar<Field>` (or any other
type argument). Similarly, if there is an impl for all `T` such as `impl<T> Debug for T`, we cannot create
any more impls to `Debug` for other types since it would be ambiguous which impl to choose for any given
method call.

```rust
trait Trait {}

// Previous impl defined here
impl<A, B> Trait for (A, B) {}

// error: Impl for type `(Field, Field)` overlaps with existing impl
impl Trait for (Field, Field) {}
```

## Trait Coherence

Another restriction on trait implementations is coherence. This restriction ensures other crates cannot create
impls that may overlap with other impls, even if several unrelated crates are used as dependencies in the same
program.

The coherence restriction is: to implement a trait, either the trait itself or the object type must be declared
in the crate the impl is in.

In practice this often comes up when using types provided by libraries. If a library provides a type `Foo` that does
not implement a trait in the standard library such as `Default`, you may not `impl Default for Foo` in your own crate.
While restrictive, this prevents later issues or silent changes in the program if the `Foo` library later added its
own impl for `Default`. If you are a user of the `Foo` library in this scenario and need a trait not implemented by the
library your choices are to either submit a patch to the library or use the newtype pattern.

### The Newtype Pattern

The newtype pattern gets around the coherence restriction by creating a new wrapper type around the library type
that we cannot create `impl`s for. Since the new wrapper type is defined in our current crate, we can create
impls for any trait we need on it.

```rust
struct Wrapper {
    foo: some_library::Foo,
}

impl Default for Wrapper {
    fn default() -> Wrapper {
        Wrapper {
            foo: some_library::Foo::new(),
        }
    }
}
```

Since we have an impl for our own type, the behavior of this code will not change even if `some_library` is updated
to provide its own `impl Default for Foo`. The downside of this pattern is that it requires extra wrapping and
unwrapping of values when converting to and from the `Wrapper` and `Foo` types.

### Trait Inheritance

Sometimes, you might need one trait to use another trait’s functionality (like "inheritance" in some other languages). In this case, you can specify this relationship by listing any child traits after the parent trait's name and a colon. Now, whenever the parent trait is implemented it will require the child traits to be implemented as well. A parent trait is also called a "super trait."

```rust
trait Person {
    fn name(self) -> String;
}

// Person is a supertrait of Student.
// Implementing Student requires you to also impl Person.
trait Student: Person {
    fn university(self) -> String;
}

trait Programmer {
    fn fav_language(self) -> String;
}

// CompSciStudent (computer science student) is a subtrait of both Programmer 
// and Student. Implementing CompSciStudent requires you to impl both supertraits.
trait CompSciStudent: Programmer + Student {
    fn git_username(self) -> String;
}
```

### Trait Aliases

Similar to the proposed Rust feature for [trait aliases](https://github.com/rust-lang/rust/blob/4d215e2426d52ca8d1af166d5f6b5e172afbff67/src/doc/unstable-book/src/language-features/trait-alias.md),
Noir supports aliasing one or more traits and using those aliases wherever
traits would normally be used.

```rust
trait Foo {
    fn foo(self) -> Self;
}

trait Bar {
    fn bar(self) -> Self;
}

// Equivalent to:
// trait Baz: Foo + Bar {}
//
// impl<T> Baz for T where T: Foo + Bar {}
trait Baz = Foo + Bar;

// We can use `Baz` to refer to `Foo + Bar`
fn baz<T>(x: T) -> T where T: Baz {
    x.foo().bar()
}
```

#### Generic Trait Aliases

Trait aliases can also be generic by placing the generic arguments after the
trait name. These generics are in scope of every item within the trait alias.

```rust
trait Foo {
    fn foo(self) -> Self;
}

trait Bar<T> {
    fn bar(self) -> T;
}

// Equivalent to:
// trait Baz<T>: Foo + Bar<T> {}
//
// impl<T, U> Baz<T> for U where U: Foo + Bar<T> {}
trait Baz<T> = Foo + Bar<T>;
```

#### Trait Alias Where Clauses

Trait aliases support where clauses to add trait constraints to any of their
generic arguments, e.g. ensuring `T: Baz` for a trait alias `Qux<T>`.

```rust
trait Foo {
    fn foo(self) -> Self;
}

trait Bar<T> {
    fn bar(self) -> T;
}

trait Baz {
    fn baz(self) -> bool;
}

// Equivalent to:
// trait Qux<T>: Foo + Bar<T> where T: Baz {}
//
// impl<T, U> Qux<T> for U where
//     U: Foo + Bar<T>,
//     T: Baz,
// {}
trait Qux<T> = Foo + Bar<T> where T: Baz;
```

Note that while trait aliases support where clauses,
the equivalent traits can fail due to [#6467](https://github.com/noir-lang/noir/issues/6467)

### Visibility

By default, like functions, traits and trait aliases are private to the module
they exist in. You can use `pub` to make the trait public or `pub(crate)` to make
it public to just its crate:

```rust
// This trait is now public
pub trait Trait {}

// This trait alias is now public
pub trait Baz = Foo + Bar;
```

Trait methods have the same visibility as the trait they are in.
---
title: Mutability
description:
  Learn about mutable variables in Noir. Discover how
  to declare, modify, and use them in your programs.
keywords: [noir programming language, mutability in noir, mutable variables]
sidebar_position: 8
---

Variables in noir can be declared mutable via the `mut` keyword. Mutable variables can be reassigned
to via an assignment expression.

```rust
let x = 2;
x = 3; // error: x must be mutable to be assigned to

let mut y = 3;
let y = 4; // OK
```

The `mut` modifier can also apply to patterns:

```rust
let (a, mut b) = (1, 2);
a = 11; // error: a must be mutable to be assigned to
b = 12; // OK

let mut (c, d) = (3, 4);
c = 13; // OK
d = 14; // OK

// etc.
let MyStruct { x: mut y } = MyStruct { x: a };
// y is now in scope
```

Note that mutability in noir is local and everything is passed by value, so if a called function
mutates its parameters then the parent function will keep the old value of the parameters.

```rust
fn main() -> pub Field {
    let x = 3;
    helper(x);
    x // x is still 3
}

fn helper(mut x: i32) {
    x = 4;
}
```

## Non-local mutability

Non-local mutability can be achieved through the mutable reference type `&mut T`:

```rust
fn set_to_zero(x: &mut Field) {
    *x = 0;
}

fn main() {
    let mut y = 42;
    set_to_zero(&mut y);
    assert(*y == 0);
}
```

When creating a mutable reference, the original variable being referred to (`y` in this
example) must also be mutable. Since mutable references are a reference type, they must
be explicitly dereferenced via `*` to retrieve the underlying value. Note that this yields
a copy of the value, so mutating this copy will not change the original value behind the
reference:

```rust
fn main() {
    let mut x = 1;
    let x_ref = &mut x;

    let mut y = *x_ref;
    let y_ref = &mut y;

    x = 2;
    *x_ref = 3;

    y = 4;
    *y_ref = 5;

    assert(x == 3);
    assert(*x_ref == 3);
    assert(y == 5);
    assert(*y_ref == 5);
}
```

Note that types in Noir are actually deeply immutable so the copy that occurs when
dereferencing is only a conceptual copy - no additional constraints will occur.

Mutable references can also be stored within structs. Note that there is also
no lifetime parameter on these unlike rust. This is because the allocated memory
always lasts the entire program - as if it were an array of one element.

```rust
struct Foo {
    x: &mut Field
}

impl Foo {
    fn incr(mut self) {
        *self.x += 1;
    }
}

fn main() {
    let foo = Foo { x: &mut 0 };
    foo.incr();
    assert(*foo.x == 1);
}
```

In general, you should avoid non-local & shared mutability unless it is needed. Sticking
to only local mutability will improve readability and potentially improve compiler optimizations as well.
---
title: Functions
description:
  Learn how to declare functions and methods in Noir, a programming language with Rust semantics.
  This guide covers parameter declaration, return types, call expressions, and more.
keywords: [Noir, Rust, functions, methods, parameter declaration, return types, call expressions]
sidebar_position: 1
---

Functions in Noir follow the same semantics of Rust, though Noir does not support early returns.

To declare a function the `fn` keyword is used.

```rust
fn foo() {}
```

By default, functions are visible only within the package they are defined. To make them visible outside of that package (for example, as part of a [library](../modules_packages_crates/crates_and_packages.md#libraries)), you should mark them as `pub`:

```rust
pub fn foo() {}
```

You can also restrict the visibility of the function to only the crate it was defined in, by specifying `pub(crate)`:

```rust
pub(crate) fn foo() {}  //foo can only be called within its crate
```

All parameters in a function must have a type and all types are known at compile time. The parameter
is pre-pended with a colon and the parameter type. Multiple parameters are separated using a comma.

```rust
fn foo(x : Field, y : Field){}
```

The return type of a function can be stated by using the `->` arrow notation. The function below
states that the foo function must return a `Field`. If the function returns no value, then the arrow
is omitted.

```rust
fn foo(x : Field, y : Field) -> Field {
    x + y
}
```

Note that a `return` keyword is unneeded in this case - the last expression in a function's body is
returned.

## Main function

If you're writing a binary, the `main` function is the starting point of your program. You can pass all types of expressions to it, as long as they have a fixed size at compile time:

```rust
fn main(x : Field) // this is fine: passing a Field
fn main(x : [Field; 2]) // this is also fine: passing a Field with known size at compile-time
fn main(x : (Field, bool)) // 👌: passing a (Field, bool) tuple means size 2
fn main(x : str<5>) // this is fine, as long as you pass a string of size 5

fn main(x : Vec<Field>) // can't compile, has variable size
fn main(x : [Field]) // can't compile, has variable size
fn main(....// i think you got it by now
```

Keep in mind [tests](../../tooling/testing.md) don't differentiate between `main` and any other function. The following snippet passes tests, but won't compile or prove:

```rust
fn main(x : [Field]) {
    assert(x[0] == 1);
}

#[test]
fn test_one() {
    main(&[1, 2]);
}
```

```bash
$ nargo test
[testing] Running 1 test functions
[testing] Testing test_one... ok
[testing] All tests passed

$ nargo check
The application panicked (crashed).
Message:  Cannot have variable sized arrays as a parameter to main
```

## Call Expressions

Calling a function in Noir is executed by using the function name and passing in the necessary
arguments.

Below we show how to call the `foo` function from the `main` function using a call expression:

```rust
fn main(x : Field, y : Field) {
    let z = foo(x);
}

fn foo(x : Field) -> Field {
    x + x
}
```

## Methods

You can define methods in Noir on any struct type in scope.

```rust
struct MyStruct {
    foo: Field,
    bar: Field,
}

impl MyStruct {
    fn new(foo: Field) -> MyStruct {
        MyStruct {
            foo,
            bar: 2,
        }
    }

    fn sum(self) -> Field {
        self.foo + self.bar
    }
}

fn main() {
    let s = MyStruct::new(40);
    assert(s.sum() == 42);
}
```

Methods are just syntactic sugar for functions, so if we wanted to we could also call `sum` as
follows:

```rust
assert(MyStruct::sum(s) == 42);
```

It is also possible to specialize which method is chosen depending on the [generic](./generics.md) type that is used. In this example, the `foo` function returns different values depending on its type:

```rust
struct Foo<T> {}

impl Foo<u32> {
    fn foo(self) -> Field { 1 }
}

impl Foo<u64> {
    fn foo(self) -> Field { 2 }
}

fn main() {
    let f1: Foo<u32> = Foo{};
    let f2: Foo<u64> = Foo{};
    assert(f1.foo() + f2.foo() == 3);
}
```

Also note that impls with the same method name defined in them cannot overlap. For example, if we already have `foo` defined for `Foo<u32>` and `Foo<u64>` like we do above, we cannot also define `foo` in an `impl<T> Foo<T>` since it would be ambiguous which version of `foo` to choose.

```rust
// Including this impl in the same project as the above snippet would
// cause an overlapping impls error
impl<T> Foo<T> {
    fn foo(self) -> Field { 3 }
}
```

## Lambdas

Lambdas are anonymous functions. They follow the syntax of Rust - `|arg1, arg2, ..., argN| return_expression`.

```rust
let add_50 = |val| val + 50;
assert(add_50(100) == 150);
```

See [Lambdas](./lambdas.md) for more details.

## Attributes

Attributes are metadata that can be applied to a function, using the following syntax: `#[attribute(value)]`.

Supported attributes include:

- **builtin**: the function is implemented by the compiler, for efficiency purposes.
- **deprecated**: mark the function as _deprecated_. Calling the function will generate a warning: `warning: use of deprecated function`
- **field**: Used to enable conditional compilation of code depending on the field size. See below for more details
- **oracle**: mark the function as _oracle_; meaning it is an external unconstrained function, implemented in noir_js. See [Unconstrained](./unconstrained.md) and [NoirJS](../../reference/NoirJS/noir_js/index.md) for more details.
- **test**: mark the function as unit tests. See [Tests](../../tooling/testing.md) for more details

### Field Attribute

The field attribute defines which field the function is compatible for. The function is conditionally compiled, under the condition that the field attribute matches the Noir native field.
The field can be defined implicitly, by using the name of the elliptic curve usually associated to it - for instance bn254, bls12_381 - or explicitly by using the field (prime) order, in decimal or hexadecimal form.
As a result, it is possible to define multiple versions of a function with each version specialized for a different field attribute. This can be useful when a function requires different parameters depending on the underlying elliptic curve.

Example: we define the function `foo()` three times below. Once for the default Noir bn254 curve, once for the field $\mathbb F_{23}$, which will normally never be used by Noir, and once again for the bls12_381 curve.

```rust
#[field(bn254)]
fn foo() -> u32 {
    1
}

#[field(23)]
fn foo() -> u32 {
    2
}

// This commented code would not compile as foo would be defined twice because it is the same field as bn254
// #[field(21888242871839275222246405745257275088548364400416034343698204186575808495617)]
// fn foo() -> u32 {
//     2
// }

#[field(bls12_381)]
fn foo() -> u32 {
    3
}
```

If the field name is not known to Noir, it will discard the function. Field names are case insensitive.
---
title: Generics
description: Learn how to use Generics in Noir
keywords: [Noir, Rust, generics, functions, structs]
sidebar_position: 7
---

Generics allow you to use the same functions with multiple different concrete data types. You can
read more about the concept of generics in the Rust documentation
[here](https://doc.rust-lang.org/book/ch10-01-syntax.html).

Here is a trivial example showing the identity function that supports any type. In Rust, it is
common to refer to the most general type as `T`. We follow the same convention in Noir.

```rust
fn id<T>(x: T) -> T  {
    x
}
```

## Numeric Generics

If we want to be generic over array lengths (which are type-level integers), we can use numeric
generics. Using these looks similar to using regular generics, but introducing them into scope
requires declaring them with `let MyGenericName: IntegerType`. This can be done anywhere a normal
generic is declared. Instead of types, these generics resolve to integers at compile-time.
Here's an example of a struct that is generic over the size of the array it contains internally:

```rust
struct BigInt<let N: u32> {
    limbs: [u32; N],
}

impl<let N: u32> BigInt<N> {
    // `N` is in scope of all methods in the impl
    fn first(first: BigInt<N>, second: BigInt<N>) -> Self {
        assert(first.limbs != second.limbs);
        first

    fn second(first: BigInt<N>, second: Self) -> Self {
        assert(first.limbs != second.limbs);
        second
    }
}
```

## In Structs

Generics are useful for specifying types in structs. For example, we can specify that a field in a
struct will be of a certain generic type. In this case `value` is of type `T`.

```rust
struct RepeatedValue<T> {
    value: T,
    count: Field,
}

impl<T> RepeatedValue<T> {
    fn print(self) {
        for _i in 0 .. self.count {
            println(self.value);
        }
    }
}

fn main() {
    let repeated = RepeatedValue { value: "Hello!", count: 2 };
    repeated.print();
}
```

The `print` function will print `Hello!` an arbitrary number of times, twice in this case.

## Calling functions on generic parameters

Since a generic type `T` can represent any type, how can we call functions on the underlying type?
In other words, how can we go from "any type `T`" to "any type `T` that has certain methods available?"

This is what [traits](../concepts/traits.md) are for in Noir. Here's an example of a function generic over
any type `T` that implements the `Eq` trait for equality:

```rust
fn first_element_is_equal<T, let N: u32>(array1: [T; N], array2: [T; N]) -> bool 
    where T: Eq
{
    if (array1.len() == 0) | (array2.len() == 0) {
        true
    } else {
        array1[0] == array2[0]
    }
}

fn main() {
    assert(first_element_is_equal([1, 2, 3], [1, 5, 6]));

    // We can use first_element_is_equal for arrays of any type
    // as long as we have an Eq impl for the types we pass in
    let array = [MyStruct::new(), MyStruct::new()];
    assert(array_eq(array, array, MyStruct::eq));
}

impl Eq for MyStruct {
    fn eq(self, other: MyStruct) -> bool {
        self.foo == other.foo
    }
}
```

You can find more details on traits and trait implementations on the [traits page](../concepts/traits.md).

## Manually Specifying Generics with the Turbofish Operator

There are times when the compiler cannot reasonably infer what type should be used for a generic, or when the developer themselves may want to manually distinguish generic type parameters. This is where the `::<>` turbofish operator comes into play.

The `::<>` operator can follow a variable or path and can be used to manually specify generic arguments within the angle brackets.
The name "turbofish" comes from that `::<>` looks like a little fish.

Examples:
```rust
fn main() {
    let mut slice = [];
    slice = slice.push_back(1);
    slice = slice.push_back(2);
    // Without turbofish a type annotation would be needed on the left hand side
    let array = slice.as_array::<2>();
}
```


```rust
trait MyTrait {
    fn ten() -> Self;
}

impl MyTrait for Field {
    fn ten() -> Self { 10 }
}

struct Foo<T> {
    inner: T
}
        
impl<T> Foo<T> {
    fn generic_method<U>(_self: Self) -> U where U: MyTrait {
        U::ten()
    }
}
        
fn example() {
    let foo: Foo<Field> = Foo { inner: 1 };
    // Using a type other than `Field` here (e.g. u32) would fail as 
    // there is no matching impl for `u32: MyTrait`. 
    //
    // Substituting the `10` on the left hand side of this assert
    // with `10 as u32` would also fail with a type mismatch as we 
    // are expecting a `Field` from the right hand side.
    assert(10 as u32 == foo.generic_method::<Field>());
}
```

## Arithmetic Generics

In addition to numeric generics, Noir also allows a limited form of arithmetic on generics.
When you have a numeric generic such as `N`, you can use the following operators on it in a
type position: `+`, `-`, `*`, `/`, and `%`.

Note that type checking arithmetic generics is a best effort guess from the compiler and there
are many cases of types that are equal that the compiler may not see as such. For example,
we know that `T * (N + M)` should be equal to `T*N + T*M` but the compiler does not currently
apply the distributive law and thus sees these as different types.

Even with this limitation though, the compiler can handle common cases decently well:

```rust
trait Serialize<let N: u32> {
    fn serialize(self) -> [Field; N];
}

impl Serialize<1> for Field {
    fn serialize(self) -> [Field; 1] {
        [self]
    }
}

impl<T, let N: u32, let M: u32> Serialize<N * M> for [T; N]
    where T: Serialize<M> { .. }

impl<T, U, let N: u32, let M: u32> Serialize<N + M> for (T, U)
    where T: Serialize<N>, U: Serialize<M> { .. }

fn main() {
    let data = (1, [2, 3, 4]);
    assert_eq(data.serialize().len(), 4);
}
```

Note that if there is any over or underflow the types will fail to unify:

#include_code underflow-example test_programs/compile_failure/arithmetic_generics_underflow/src/main.nr rust

This also applies if there is underflow in an intermediate calculation:

#include_code intermediate-underflow-example test_programs/compile_failure/arithmetic_generics_intermediate_underflow/src/main.nr rust
---
title: Comments
description:
  Learn how to write comments in Noir programming language. A comment is a line of code that is
  ignored by the compiler, but it can be read by programmers. Single-line and multi-line comments
  are supported in Noir.
keywords: [Noir programming language, comments, single-line comments, multi-line comments]
sidebar_position: 10
---

A comment is a line in your codebase which the compiler ignores, however it can be read by
programmers.

Here is a single line comment:

```rust
// This is a comment and is ignored
```

`//` is used to tell the compiler to ignore the rest of the line.

Noir also supports multi-line block comments. Start a block comment with `/*` and end the block with `*/`.

Noir does not natively support doc comments. You may be able to use [Rust doc comments](https://doc.rust-lang.org/reference/comments.html) in your code to leverage some Rust documentation build tools with Noir code.

```rust
/*
  This is a block comment describing a complex function.
*/
fn main(x : Field, y : pub Field) {
    assert(x != y);
}
```
---
title: Shadowing
sidebar_position: 12
---

Noir allows for inheriting variables' values and re-declaring them with the same name similar to Rust, known as shadowing.

For example, the following function is valid in Noir:

```rust
fn main() {
    let x = 5;

    {
        let x = x * 2;
        assert (x == 10);
    }

    assert (x == 5);
}
```

In this example, a variable x is first defined with the value 5.

The local scope that follows shadows the original x, i.e. creates a local mutable x based on the value of the original x. It is given a value of 2 times the original x.

When we return to the main scope, x once again refers to just the original x, which stays at the value of 5.

## Temporal mutability

One way that shadowing is useful, in addition to ergonomics across scopes, is for temporarily mutating variables.

```rust
fn main() {
    let age = 30;
    // age = age + 5; // Would error as `age` is immutable by default.

    let mut age = age + 5; // Temporarily mutates `age` with a new value.

    let age = age; // Locks `age`'s mutability again.

    assert (age == 35);
}
```
---
title: Logical Operations
description:
  Learn about the supported arithmetic and logical operations in the Noir programming language.
  Discover how to perform operations on private input types, integers, and booleans.
keywords:
  [
    Noir programming language,
    supported operations,
    arithmetic operations,
    logical operations,
    predicate operators,
    bitwise operations,
    short-circuiting,
    backend,
  ]
sidebar_position: 3
---

# Operations

## Table of Supported Operations

| Operation |                          Description                           |                           Requirements |
| :-------- | :------------------------------------------------------------: | -------------------------------------: |
| +         |             Adds two private input types together              |            Types must be private input |
| -         |           Subtracts two private input types together           |            Types must be private input |
| \*        |          Multiplies two private input types together           |            Types must be private input |
| /         |            Divides two private input types together            |            Types must be private input |
| ^         |              XOR two private input types together              |                  Types must be integer |
| &         |              AND two private input types together              |                  Types must be integer |
| \|        |              OR two private input types together               |                  Types must be integer |
| \<\<        |        Left shift an integer by another integer amount         | Types must be integer, shift must be u8 |
| >>        |        Right shift an integer by another integer amount        | Types must be integer, shift must be u8 |
| !         |                     Bitwise not of a value                     |        Type must be integer or boolean |
| \<         |       returns a bool if one value is less than the other       | Upper bound must have a known bit size |
| \<=        | returns a bool if one value is less than or equal to the other | Upper bound must have a known bit size |
| >         |       returns a bool if one value is more than the other       | Upper bound must have a known bit size |
| >=        | returns a bool if one value is more than or equal to the other | Upper bound must have a known bit size |
| ==        |       returns a bool if one value is equal to the other        |       Both types must not be constants |
| !=        |     returns a bool if one value is not equal to the other      |       Both types must not be constants |

### Predicate Operators

`<,<=, !=, == , >, >=` are known as predicate/comparison operations because they compare two values.
This differs from the operations such as `+` where the operands are used in _computation_.

### Bitwise Operations Example

```rust
fn main(x : Field) {
    let y = x as u32;
    let z = y & y;
}
```

`z` is implicitly constrained to be the result of `y & y`. The `&` operand is used to denote bitwise
`&`.

> `x & x` would not compile as `x` is a `Field` and not an integer type.

### Logical Operators

Noir has no support for the logical operators `||` and `&&`. This is because encoding the
short-circuiting that these operators require can be inefficient for Noir's backend. Instead you can
use the bitwise operators `|` and `&` which operate identically for booleans, just without the
short-circuiting.

```rust
let my_val = 5;

let mut flag = 1;
if (my_val > 6) | (my_val == 0) {
    flag = 0;
}
assert(flag == 1);

if (my_val != 10) & (my_val < 50) {
    flag = 0;
}
assert(flag == 0);
```

### Shorthand operators

Noir shorthand operators for most of the above operators, namely `+=, -=, *=, /=, %=, &=, |=, ^=, <<=`, and `>>=`. These allow for more concise syntax. For example:

```rust
let mut i = 0;
i = i + 1;
```

could be written as:

```rust
let mut i = 0;
i += 1;
```
---
title: Oracles
description: Dive into how Noir supports Oracles via RPC calls, and learn how to declare an Oracle in Noir with our comprehensive guide.
keywords:
  - Noir
  - Oracles
  - RPC Calls
  - Unconstrained Functions
  - Programming
  - Blockchain
sidebar_position: 6
---

import Experimental from '@site/src/components/Notes/_experimental.mdx';

<Experimental />

Noir has support for Oracles via RPC calls. This means Noir will make an RPC call and use the return value for proof generation.

Since Oracles are not resolved by Noir, they are [`unconstrained` functions](./unconstrained.md)

You can declare an Oracle through the `#[oracle(<name>)]` flag. Example:

```rust
#[oracle(get_number_sequence)]
unconstrained fn get_number_sequence(_size: Field) -> [Field] {}
```

The timeout for when using an external RPC oracle resolver can be set with the `NARGO_FOREIGN_CALL_TIMEOUT` environment variable. This timeout is in units of milliseconds.
---
title: Global Variables
description:
  Learn about global variables in Noir. Discover how
  to declare, modify, and use them in your programs.
keywords: [noir programming language, globals, global variables, constants]
sidebar_position: 8
---

## Globals


Noir supports global variables. The global's type must be specified by the user:

```rust
global N: Field = 5;

global TUPLE: (Field, Field) = (3, 2);

fn main() {
    assert(N == 5);
    assert(N == TUPLE.0 + TUPLE.1);
}
```

:::info

Globals can be defined as any expression, so long as they don't depend on themselves - otherwise there would be a dependency cycle! For example:

```rust
global T: u32 = foo(T); // dependency error
```

:::


If they are initialized to a literal integer, globals can be used to specify an array's length:

```rust
global N: u32 = 2;

fn main(y : [Field; N]) {
    assert(y[0] == y[1])
}
```

A global from another module can be imported or referenced externally like any other name:

```rust
global N: Field = 20;

fn main() {
    assert(my_submodule::N != N);
}

mod my_submodule {
    global N: Field = 10;
}
```

When a global is used, Noir replaces the name with its definition on each occurrence.
This means globals defined using function calls will repeat the call each time they're used:

```rust
global RESULT: [Field; 100] = foo();

fn foo() -> [Field; 100] { ... }
```

This is usually fine since Noir will generally optimize any function call that does not
refer to a program input into a constant. It should be kept in mind however, if the called
function performs side-effects like `println`, as these will still occur on each use.

### Visibility

By default, like functions, globals are private to the module they exist in. You can use `pub`
to make the global public or `pub(crate)` to make it public to just its crate:

```rust
// This global is now public
pub global N: u32 = 5;
```
---
title: Data Bus
sidebar_position: 13
---
import Experimental from '@site/src/components/Notes/_experimental.mdx';

<Experimental />

The data bus is an optimization that the backend can use to make recursion more efficient.
In order to use it, you must define some inputs of the program entry points (usually the `main()`
function) with the `call_data` modifier, and the return values with the `return_data` modifier.
These modifiers are incompatible with `pub` and `mut` modifiers.

## Example

```rust
fn main(mut x: u32, y: call_data u32, z: call_data [u32;4] ) -> return_data u32 {
  let a = z[x];
  a+y
}
```

As a result, both call_data and return_data will be treated as private inputs and encapsulated into a read-only array each, for the backend to process.
---
title: Lambdas
description: Learn how to use anonymous functions in Noir programming language.
keywords: [Noir programming language, lambda, closure, function, anonymous function]
sidebar_position: 9
---

## Introduction

Lambdas are anonymous functions. The syntax is `|arg1, arg2, ..., argN| return_expression`.

```rust
let add_50 = |val| val + 50;
assert(add_50(100) == 150);
```

A block can be used as the body of a lambda, allowing you to declare local variables inside it:

```rust
let cool = || {
  let x = 100;
  let y = 100;
  x + y
}

assert(cool() == 200);
```

## Closures

Inside the body of a lambda, you can use variables defined in the enclosing function. Such lambdas are called **closures**. In this example `x` is defined inside `main` and is accessed from within the lambda:

```rust
fn main() {
  let x = 100;
  let closure = || x + 150;
  assert(closure() == 250);
}
```

## Passing closures to higher-order functions

It may catch you by surprise that the following code fails to compile:

```rust
fn foo(f: fn () -> Field) -> Field {
 f()
}

fn main() {
  let (x, y) = (50, 50);
  assert(foo(|| x + y) == 100); // error :(
}
```

The reason is that the closure's capture environment affects its type - we have a closure that captures two Fields and `foo`
expects a regular function as an argument - those are incompatible.
:::note

Variables contained within the `||` are the closure's parameters, and the expression that follows it is the closure's body. The capture environment is comprised of any variables used in the closure's body that are not parameters.

E.g. in |x| x + y, y would be a captured variable, but x would not be, since it is a parameter of the closure.

:::
The syntax for the type of a closure is `fn[env](args) -> ret_type`, where `env` is the capture environment of the closure -
in this example that's `(Field, Field)`.

The best solution in our case is to make `foo` generic over the environment type of its parameter, so that it can be called
with closures with any environment, as well as with regular functions:

```rust
fn foo<Env>(f: fn[Env]() -> Field) -> Field {
 f()
}

fn main() {
  let (x, y) = (50, 50);
  assert(foo(|| x + y) == 100); // compiles fine
  assert(foo(|| 60) == 60);     // compiles fine
}
```
---
title: Compile-time Code & Metaprogramming
description: Learn how to use metaprogramming in Noir to create macros or derive your own traits
keywords: [Noir, comptime, compile-time, metaprogramming, macros, quote, unquote]
sidebar_position: 15
---

## Overview

Metaprogramming in Noir is comprised of three parts:
1. `comptime` code
2. Quoting and unquoting
3. The metaprogramming API in `std::meta`

Each of these are explained in more detail in the next sections but the wide picture is that
`comptime` allows us to write code which runs at compile-time. In this `comptime` code we
can quote and unquote snippets of the program, manipulate them, and insert them in other
parts of the program. Comptime functions which do this are said to be macros. Additionally,
there's a compile-time API of built-in types and functions provided by the compiler which allows
for greater analysis and modification of programs.

---

## Comptime

`comptime` is a new keyword in Noir which marks an item as executing or existing at compile-time. It can be used in several ways:

- `comptime fn` to define functions which execute exclusively during compile-time.
- `comptime global` to define a global variable which is evaluated at compile-time.
  - Unlike runtime globals, `comptime global`s can be mutable.
- `comptime { ... }` to execute a block of statements during compile-time.
- `comptime let` to define a variable whose value is evaluated at compile-time.
- `comptime for` to run a for loop at compile-time. Syntax sugar for `comptime { for .. }`.

### Scoping

Note that while in a `comptime` context, any runtime variables _local to the current function_ are never visible.

### Evaluating

Evaluation rules of `comptime` follows the normal unconstrained evaluation rules for other Noir code. There are a few things to note though:

- Certain built-in functions may not be available, although more may be added over time.
- Evaluation order of `comptime {}` blocks within global items is currently unspecified. For example, given the following two functions we can't guarantee
which `println` will execute first. The ordering of the two printouts will be arbitrary, but should be stable across multiple compilations with the same `nargo` version as long as the program is also unchanged.

```rust
fn one() {
    comptime { println("one"); }
}

fn two() {
    comptime { println("two"); }
}
```

- Since evaluation order is unspecified, care should be taken when using mutable globals so that they do not rely on a particular ordering.
For example, using globals to generate unique ids should be fine but relying on certain ids always being produced (especially after edits to the program) should be avoided.
- Although the ordering of comptime code is usually unspecified, there are cases where it is:
  - Dependencies of a crate will always be evaluated before the dependent crate.
  - Any attributes on a function will be run before the function body is resolved. This is to allow the attribute to modify the function if necessary. Note that if the
    function itself was called at compile-time previously, it will already be resolved and cannot be modified. To prevent accidentally calling functions you wish to modify
    at compile-time, it may be helpful to sort your `comptime` annotation functions into a different submodule crate along with any dependencies they require.
  - Unlike raw `comptime {}` blocks, attributes on top-level items in the program do have a set evaluation order. Attributes within a module are evaluated top-down, and attributes
    in different modules are evaluated submodule-first. Sibling modules to the same parent module are evaluated in order of the module declarations (`mod foo; mod bar;`) in their
    parent module.

### Lowering

When a `comptime` value is used in runtime code it must be lowered into a runtime value. This means replacing the expression with the literal that it evaluated to. For example, the code:

```rust
struct Foo { array: [Field; 2], len: u32 }

fn main() {
    println(comptime {
        let mut foo = std::mem::zeroed::<Foo>();
        foo.array[0] = 4;
        foo.len = 1;
        foo
    });
}
```

will be converted to the following after `comptime` expressions are evaluated:

```rust
struct Foo { array: [Field; 2], len: u32 }

fn main() {
    println(Foo { array: [4, 0], len: 1 });
}
```

Not all types of values can be lowered. For example, references, `Type`s, and `TypeDefinition`s (among other types) cannot be lowered at all.

```rust
fn main() {
    // There's nothing we could inline here to create a Type value at runtime
    // let _ = get_type!();
}

comptime fn get_type() -> Type { ... }
```

Values of certain types may also change type when they are lowered. For example, a comptime format string will already be
formatted, and thus lowers into a runtime string instead:

```rust
fn main() {
    let foo = comptime {
        let i = 2;
        f"i = {i}"
    };
    assert_eq(foo, "i = 2");
}
```

---

## (Quasi) Quote

Macros in Noir are `comptime` functions which return code as a value which is inserted into the call site when it is lowered there.
A code value in this case is of type `Quoted` and can be created by a `quote { ... }` expression.
More specifically, the code value `quote` creates is a token stream - a representation of source code as a series of words, numbers, string literals, or operators.
For example, the expression `quote { Hi "there reader"! }` would quote three tokens: the word "hi", the string "there reader", and an exclamation mark.
You'll note that snippets that would otherwise be invalid syntax can still be quoted.

When a `Quoted` value is used in runtime code, it is lowered into a `quote { ... }` expression. Since this expression is only valid
in compile-time code however, we'd get an error if we tried this. Instead, we can use macro insertion to insert each token into the
program at that point, and parse it as an expression. To do this, we have to add a `!` after the function name returning the `Quoted` value.
If the value was created locally and there is no function returning it, `std::meta::unquote!(_)` can be used instead.
Calling such a function at compile-time without `!` will just return the `Quoted` value to be further manipulated. For example:

#include_code quote-example noir_stdlib/src/meta/mod.nr rust

For those familiar with quoting from other languages (primarily lisps), Noir's `quote` is actually a _quasiquote_.
This means we can escape the quoting by using the unquote operator to splice values in the middle of quoted code.

In addition to curly braces, you can also use square braces for the quote operator:

```rust
comptime {
    let q1 = quote { 1 };
    let q2 = quote [ 2 ];
    assert_eq(q1, q2);

    // Square braces can be used to quote mismatched curly braces if needed
    let _ = quote[}];
}
```

---

## Unquote

The unquote operator `$` is usable within a `quote` expression.
It takes a variable as an argument, evaluates the variable, and splices the resulting value into the quoted token stream at that point. For example,

```rust
comptime {
    let x = 1 + 2;
    let y = quote { $x + 4 };
}
```

The value of `y` above will be the token stream containing `3`, `+`, and `4`. We can also use this to combine `Quoted` values into larger token streams:

```rust
comptime {
    let x = quote { 1 + 2 };
    let y = quote { $x + 4 };
}
```

The value of `y` above is now the token stream containing five tokens: `1 + 2 + 4`.

Note that to unquote something, a variable name _must_ follow the `$` operator in a token stream.
If it is an expression (even a parenthesized one), it will do nothing. Most likely a parse error will be given when the macro is later unquoted.

Unquoting can also be avoided by escaping the `$` with a backslash:

```rust
comptime {
    let x = quote { 1 + 2 };

    // y contains the four tokens: `$x + 4`
    let y = quote { \$x + 4 };
}
```

### Combining Tokens

Note that `Quoted` is internally a series of separate tokens, and that all unquoting does is combine these token vectors.
This means that code which appears to append like a string actually appends like a vector internally:

```rust
comptime {
    let x = 3;
    let q = quote { foo$x }; // This is [foo, 3], not [foo3]

    // Spaces are ignored in general, they're never part of a token
    assert_eq(q, quote { foo   3 });
}
```

If you do want string semantics, you can use format strings then convert back to a `Quoted` value with `.quoted_contents()`.
Note that formatting a quoted value with multiple tokens will always insert a space between each token. If this is
undesired, you'll need to only operate on quoted values containing a single token. To do this, you can iterate
over each token of a larger quoted value with `.tokens()`:

#include_code concatenate-example noir_stdlib/src/meta/mod.nr rust

---

## Attributes

Attributes provide a way to run a `comptime` function on an item in the program.
When you use an attribute, the function with the same name will be called with that item as an argument:

```rust
#[my_struct_attribute]
struct Foo {}

comptime fn my_struct_attribute(s: StructDefinition) {
    println("Called my_struct_attribute!");
}

#[my_function_attribute]
fn foo() {}

comptime fn my_function_attribute(f: FunctionDefinition) {
    println("Called my_function_attribute!");
}
```

Anything returned from one of these functions will be inserted at top-level along with the original item.
Note that expressions are not valid at top-level so you'll get an error trying to return `3` or similar just as if you tried to write a program containing `3; struct Foo {}`.
You can insert other top-level items such as trait impls, structs, or functions this way though.
For example, this is the mechanism used to insert additional trait implementations into the program when deriving a trait impl from a struct:

#include_code derive-field-count-example noir_stdlib/src/meta/mod.nr rust

### Calling annotations with additional arguments

Arguments may optionally be given to attributes.
When this is done, these additional arguments are passed to the attribute function after the item argument.

#include_code annotation-arguments-example noir_stdlib/src/meta/mod.nr rust

We can also take any number of arguments by adding the `varargs` attribute:

#include_code annotation-varargs-example noir_stdlib/src/meta/mod.nr rust

### Attribute Evaluation Order

Unlike the evaluation order of stray `comptime {}` blocks within functions, attributes have a well-defined evaluation
order. Within a module, attributes are evaluated top to bottom. Between modules, attributes in child modules are evaluated
first. Attributes in sibling modules are resolved following the `mod foo; mod bar;` declaration order within their parent
modules.

```rust
mod foo; // attributes in foo are run first
mod bar; // followed by attributes in bar

// followed by any attributes in the parent module
#[derive(Eq)]
struct Baz {}
```

Note that because of this evaluation order, you may get an error trying to derive a trait for a struct whose fields
have not yet had the trait derived already:

```rust
// Error! `Bar` field of `Foo` does not (yet) implement Eq!
#[derive(Eq)]
struct Foo {
    bar: Bar
}

#[derive(Eq)]
struct Bar {}
```

In this case, the issue can be resolved by rearranging the structs.

---

## Comptime API

Although `comptime`, `quote`, and unquoting provide a flexible base for writing macros,
Noir's true metaprogramming ability comes from being able to interact with the compiler through a compile-time API.
This API can be accessed through built-in functions in `std::meta` as well as on methods of several `comptime` types.

The following is an incomplete list of some `comptime` types along with some useful methods on them. You can see more in the standard library [Metaprogramming section](../standard_library/meta).

- `Quoted`: A token stream
- `Type`: The type of a Noir type
  - `fn implements(self, constraint: TraitConstraint) -> bool`
    - Returns true if `self` implements the given trait constraint
- `Expr`: A syntactically valid expression. Can be used to recur on a program's parse tree to inspect how it is structured.
  - Methods:
    - `fn as_function_call(self) -> Option<(Expr, [Expr])>`
      - If this is a function call expression, return `(function, arguments)`
    - `fn as_block(self) -> Option<[Expr]>`
      - If this is a block, return each statement in the block
- `FunctionDefinition`: A function definition
  - Methods:
    - `fn parameters(self) -> [(Quoted, Type)]`
      - Returns a slice of `(name, type)` pairs for each parameter
- `StructDefinition`: A struct definition
  - Methods:
    - `fn as_type(self) -> Type`
      - Returns this `StructDefinition` as a `Type`. Any generics are kept as-is
    - `fn generics(self) -> [Quoted]`
      - Return the name of each generic on this struct
    - `fn fields(self) -> [(Quoted, Type)]`
      - Return the name and type of each field
- `TraitConstraint`: A trait constraint such as `From<Field>`
- `TypedExpr`: A type-checked expression.
- `UnresolvedType`: A syntactic notation that refers to a Noir type that hasn't been resolved yet

There are many more functions available by exploring the `std::meta` module and its submodules.
Using these methods is the key to writing powerful metaprogramming libraries.

### `#[use_callers_scope]`

Since certain functions such as `Quoted::as_type`, `Expression::as_type`, or `Quoted::as_trait_constraint` will attempt
to resolve their contents in a particular scope - it can be useful to change the scope they resolve in. By default
these functions will resolve in the current function's scope which is usually the attribute function they are called in.
If you're working on a library however, this may be a completely different module or crate to the item you're trying to
use the attribute on. If you want to be able to use `Quoted::as_type` to refer to types local to the caller's scope for
example, you can annotate your attribute function with `#[use_callers_scope]`. This will ensure your attribute, and any
closures it uses, can refer to anything in the caller's scope. `#[use_callers_scope]` also works recursively. So if both
your attribute function and a helper function it calls use it, then they can both refer to the same original caller.

---

## Example: Derive

Using all of the above, we can write a `derive` macro that behaves similarly to Rust's but is not built into the language.
From the user's perspective it will look like this:

```rust
// Example usage
#[derive(Default, Eq, Ord)]
struct MyStruct { my_field: u32 }
```

To implement `derive` we'll have to create a `comptime` function that accepts
a variable amount of traits.

#include_code derive_example noir_stdlib/src/meta/mod.nr rust

Registering a derive function could be done as follows:

#include_code derive_via noir_stdlib/src/meta/mod.nr rust

#include_code big-derive-usage-example noir_stdlib/src/meta/mod.nr rust
---
title: Tuples
description:
  Dive into the Tuple data type in Noir. Understand its methods, practical examples, and best practices for efficiently using Tuples in your Noir code.
keywords:
  [
    noir,
    tuple type,
    methods,
    examples,
    multi-value containers,
  ]
sidebar_position: 7
---

A tuple collects multiple values like an array, but with the added ability to collect values of
different types:

```rust
fn main() {
    let tup: (u8, u64, Field) = (255, 500, 1000);
}
```

One way to access tuple elements is via destructuring using pattern matching:

```rust
fn main() {
    let tup = (1, 2);

    let (one, two) = tup;

    let three = one + two;
}
```

Another way to access tuple elements is via direct member access, using a period (`.`) followed by
the index of the element we want to access. Index `0` corresponds to the first tuple element, `1` to
the second and so on:

```rust
fn main() {
    let tup = (5, 6, 7, 8);

    let five = tup.0;
    let eight = tup.3;
}
```
---
title: Data Types
description:
  Get a clear understanding of the two categories of Noir data types - primitive types and compound
  types. Learn about their characteristics, differences, and how to use them in your Noir
  programming.
keywords:
  [
    noir,
    data types,
    primitive types,
    compound types,
    private types,
    public types,
  ]
---

Every value in Noir has a type, which determines which operations are valid for it.

All values in Noir are fundamentally composed of `Field` elements. For a more approachable
developing experience, abstractions are added on top to introduce different data types in Noir.

Noir has two category of data types: primitive types (e.g. `Field`, integers, `bool`) and compound
types that group primitive types (e.g. arrays, tuples, structs). Each value can either be private or
public.

## Private & Public Types

A **private value** is known only to the Prover, while a **public value** is known by both the
Prover and Verifier. Mark values as `private` when the value should only be known to the prover. All
primitive types (including individual fields of compound types) in Noir are private by default, and
can be marked public when certain values are intended to be revealed to the Verifier.

> **Note:** For public values defined in Noir programs paired with smart contract verifiers, once
> the proofs are verified on-chain the values can be considered known to everyone that has access to
> that blockchain.

Public data types are treated no differently to private types apart from the fact that their values
will be revealed in proofs generated. Simply changing the value of a public type will not change the
circuit (where the same goes for changing values of private types as well).

_Private values_ are also referred to as _witnesses_ sometimes.

> **Note:** The terms private and public when applied to a type (e.g. `pub Field`) have a different
> meaning than when applied to a function (e.g. `pub fn foo() {}`).
>
> The former is a visibility modifier for the Prover to interpret if a value should be made known to
> the Verifier, while the latter is a visibility modifier for the compiler to interpret if a
> function should be made accessible to external Noir programs like in other languages.

### pub Modifier

All data types in Noir are private by default. Types are explicitly declared as public using the
`pub` modifier:

```rust
fn main(x : Field, y : pub Field) -> pub Field {
    x + y
}
```

In this example, `x` is **private** while `y` and `x + y` (the return value) are **public**. Note
that visibility is handled **per variable**, so it is perfectly valid to have one input that is
private and another that is public.

> **Note:** Public types can only be declared through parameters on `main`.

## Type Aliases

A type alias is a new name for an existing type. Type aliases are declared with the keyword `type`:

```rust
type Id = u8;

fn main() {
    let id: Id = 1;
    let zero: u8 = 0;
    assert(zero + 1 == id);
}
```

Type aliases can also be used with [generics](../generics.md):

```rust
type Id<Size> = Size;

fn main() {
    let id: Id<u32> = 1;
    let zero: u32 = 0;
    assert(zero + 1 == id);
}
```

Type aliases can even refer to other aliases. An error will be issued if they form a cycle:

```rust
// Ok!
type A = B;
type B = Field;

type Bad1 = Bad2;

// error: Dependency cycle found
type Bad2 = Bad1;
//   ^^^^^^^^^^^ 'Bad2' recursively depends on itself: Bad2 -> Bad1 -> Bad2
```

By default, like functions, type aliases are private to the module they exist in. You can use `pub`
to make the type alias public or `pub(crate)` to make it public to just its crate:

```rust
// This type alias is now public
pub type Id = u8;
```

## Wildcard Type
Noir can usually infer the type of the variable from the context, so specifying the type of a variable is only required when it cannot be inferred. However, specifying a complex type can be tedious, especially when it has multiple generic arguments. Often some of the generic types can be inferred from the context, and Noir only needs a hint to properly infer the other types. We can partially specify a variable's type by using `_` as a marker, indicating where we still want the compiler to infer the type.

```rust
let a: [_; 4] = foo(b);
```
 

### BigInt

You can achieve BigInt functionality using the [Noir BigInt](https://github.com/shuklaayush/noir-bigint) library.
---
title: Strings
description:
  Discover the String data type in Noir. Learn about its methods, see real-world examples, and understand how to effectively manipulate and use Strings in Noir.
keywords:
  [
    noir,
    string type,
    methods,
    examples,
    concatenation,
  ]
sidebar_position: 3
---


The string type is a fixed length value defined with `str<N>`.

You can use strings in `assert()` functions or print them with
`println()`. See more about [Logging](../../standard_library/logging.md).

```rust

fn main(message : pub str<11>, hex_as_string : str<4>) {
    println(message);
    assert(message == "hello world");
    assert(hex_as_string == "0x41");
}
```

You can convert a `str<N>` to a byte array by calling `as_bytes()`
or a vector by calling `as_bytes_vec()`.

```rust
fn main() {
    let message = "hello world";
    let message_bytes = message.as_bytes();
    let mut message_vec = message.as_bytes_vec();
    assert(message_bytes.len() == 11);
    assert(message_bytes[0] == 104);
    assert(message_bytes[0] == message_vec.get(0));
}
```

## Escape characters

You can use escape characters for your strings:

| Escape Sequence | Description     |
|-----------------|-----------------|
| `\r`            | Carriage Return |
| `\n`            | Newline         |
| `\t`            | Tab             |
| `\0`            | Null Character  |
| `\"`            | Double Quote    |
| `\\`            | Backslash       |

Example:

```rust
let s = "Hello \"world" // prints "Hello "world"
let s = "hey \tyou"; // prints "hey   you"
```

## Raw strings

A raw string begins with the letter `r` and is optionally delimited by a number of hashes `#`.

Escape characters are *not* processed within raw strings. All contents are interpreted literally.

Example:

```rust
let s = r"Hello world";
let s = r#"Simon says "hello world""#;

// Any number of hashes may be used (>= 1) as long as the string also terminates with the same number of hashes
let s = r#####"One "#, Two "##, Three "###, Four "####, Five will end the string."#####; 
```

## Format strings

A format string begins with the letter `f` and allows inserting the value of local and global variables in it.

Example:

```rust
let four = 2 + 2;
let s = f"Two plus two is: {four}";
println(s);
```

The output of the above program is:

```text
Two plus two is: 4
```

To insert the value of a local or global variable, put it inside `{...}` in the string.

If you need to write the `{` or `}` characters, use `{{` and `}}` respectively:

```rust
let four = 2 + 2;

// Prints "This is not expanded: {four}"
println(f"This is not expanded: {{four}}");
```

More complex expressions are not allowed inside `{...}`:

```rust
let s = f"Two plus two is: {2 + 2}" // Error: invalid format string
```---
title: Booleans
description:
  Delve into the Boolean data type in Noir. Understand its methods, practical examples, and best practices for using Booleans in your Noir programs.
keywords:
  [
    noir,
    boolean type,
    methods,
    examples,
    logical operations,
  ]
sidebar_position: 2
---


The `bool` type in Noir has two possible values: `true` and `false`:

```rust
fn main() {
    let t = true;
    let f: bool = false;
}
```

The boolean type is most commonly used in conditionals like `if` expressions and `assert`
statements. More about conditionals is covered in the [Control Flow](../control_flow.md) and
[Assert Function](../assert.md) sections.
---
title: Structs
description:
  Explore the Struct data type in Noir. Learn about its methods, see real-world examples, and grasp how to effectively define and use Structs in your Noir programs.
keywords:
  [
    noir,
    struct type,
    methods,
    examples,
    data structures,
  ]
sidebar_position: 8
---

A struct also allows for grouping multiple values of different types. Unlike tuples, we can also
name each field.

> **Note:** The usage of _field_ here refers to each element of the struct and is unrelated to the
> field type of Noir.

Defining a struct requires giving it a name and listing each field within as `<Key>: <Type>` pairs:

```rust
struct Animal {
    hands: Field,
    legs: Field,
    eyes: u8,
}
```

An instance of a struct can then be created with actual values in `<Key>: <Value>` pairs in any
order. Struct fields are accessible using their given names:

```rust
fn main() {
    let legs = 4;

    let dog = Animal {
        eyes: 2,
        hands: 0,
        legs,
    };

    let zero = dog.hands;
}
```

Structs can also be destructured in a pattern, binding each field to a new variable:

```rust
fn main() {
    let Animal { hands, legs: feet, eyes } = get_octopus();

    let ten = hands + feet + eyes as u8;
}

fn get_octopus() -> Animal {
    let octopus = Animal {
        hands: 0,
        legs: 8,
        eyes: 2,
    };

    octopus
}
```

The new variables can be bound with names different from the original struct field names, as
showcased in the `legs --> feet` binding in the example above.

### Visibility

By default, like functions, structs are private to the module they exist in. You can use `pub`
to make the struct public or `pub(crate)` to make it public to just its crate:

```rust
// This struct is now public
pub struct Animal {
    hands: Field,
    legs: Field,
    eyes: u8,
}
```

The same applies to struct fields: by default they are private to the module they exist in,
but they can be made `pub` or `pub(crate)`:

```rust
// This struct is now public
pub struct Animal {
    hands: Field,           // private to its module
    pub(crate) legs: Field, // accessible from the entire crate
    pub eyes: u8,           // accessible from anywhere
}
```---
title: Slices
description: Explore the Slice data type in Noir. Understand its methods, see real-world examples, and learn how to effectively use Slices in your Noir programs.
keywords: [noir, slice type, methods, examples, subarrays]
sidebar_position: 5
---

import Experimental from '@site/src/components/Notes/_experimental.mdx';

<Experimental />

A slice is a dynamically-sized view into a sequence of elements. They can be resized at runtime, but because they don't own the data, they cannot be returned from a circuit. You can treat slices as arrays without a constrained size.

```rust
fn main() -> pub u32 {
    let mut slice: [Field] = &[0; 2];

    let mut new_slice = slice.push_back(6);
    new_slice.len()
}
```

To write a slice literal, use a preceding ampersand as in: `&[0; 2]` or
`&[1, 2, 3]`.

It is important to note that slices are not references to arrays. In Noir,
`&[..]` is more similar to an immutable, growable vector.

View the corresponding test file [here][test-file].

[test-file]: https://github.com/noir-lang/noir/blob/f387ec1475129732f72ba294877efdf6857135ac/crates/nargo_cli/tests/test_data_ssa_refactor/slices/src/main.nr

## Methods

For convenience, the STD provides some ready-to-use, common methods for slices:

### push_back

Pushes a new element to the end of the slice, returning a new slice with a length one greater than the original unmodified slice.

```rust
fn push_back<T>(_self: [T], _elem: T) -> [T]
```

example:

```rust
fn main() -> pub Field {
    let mut slice: [Field] = &[0; 2];

    let mut new_slice = slice.push_back(6);
    new_slice.len()
}
```

View the corresponding test file [here][test-file].

### push_front

Returns a new array with the specified element inserted at index 0. The existing elements indexes are incremented by 1.

```rust
fn push_front(_self: Self, _elem: T) -> Self
```

Example:

```rust
let mut new_slice: [Field] = &[];
new_slice = new_slice.push_front(20);
assert(new_slice[0] == 20); // returns true
```

View the corresponding test file [here][test-file].

### pop_front

Returns a tuple of two items, the first element of the array and the rest of the array.

```rust
fn pop_front(_self: Self) -> (T, Self)
```

Example:

```rust
let (first_elem, rest_of_slice) = slice.pop_front();
```

View the corresponding test file [here][test-file].

### pop_back

Returns a tuple of two items, the beginning of the array with the last element omitted and the last element.

```rust
fn pop_back(_self: Self) -> (Self, T)
```

Example:

```rust
let (popped_slice, last_elem) = slice.pop_back();
```

View the corresponding test file [here][test-file].

### append

Loops over a slice and adds it to the end of another.

```rust
fn append(mut self, other: Self) -> Self
```

Example:

```rust
let append = &[1, 2].append(&[3, 4, 5]);
```

### insert

Inserts an element at a specified index and shifts all following elements by 1.

```rust
fn insert(_self: Self, _index: Field, _elem: T) -> Self
```

Example:

```rust
new_slice = rest_of_slice.insert(2, 100);
assert(new_slice[2] == 100);
```

View the corresponding test file [here][test-file].

### remove

Remove an element at a specified index, shifting all elements after it to the left, returning the altered slice and the removed element.

```rust
fn remove(_self: Self, _index: Field) -> (Self, T)
```

Example:

```rust
let (remove_slice, removed_elem) = slice.remove(3);
```

### len

Returns the length of a slice

```rust
fn len(self) -> Field
```

Example:

```rust
fn main() {
    let slice = &[42, 42];
    assert(slice.len() == 2);
}
```

### as_array

Converts this slice into an array.

Make sure to specify the size of the resulting array.
Panics if the resulting array length is different than the slice's length.

```rust
fn as_array<let N: u32>(self) -> [T; N]
```

Example:

```rust
fn main() {
    let slice = &[5, 6];

    // Always specify the length of the resulting array!
    let array: [Field; 2] = slice.as_array();

    assert(array[0] == slice[0]);
    assert(array[1] == slice[1]);
}
```

### map

Applies a function to each element of the slice, returning a new slice containing the mapped elements.

```rust
fn map<U, Env>(self, f: fn[Env](T) -> U) -> [U]
```

example

```rust
let a = &[1, 2, 3];
let b = a.map(|a| a * 2); // b is now &[2, 4, 6]
```

### fold

Applies a function to each element of the slice, returning the final accumulated value. The first
parameter is the initial value.

```rust
fn fold<U, Env>(self, mut accumulator: U, f: fn[Env](U, T) -> U) -> U
```

This is a left fold, so the given function will be applied to the accumulator and first element of
the slice, then the second, and so on. For a given call the expected result would be equivalent to:

```rust
let a1 = &[1];
let a2 = &[1, 2];
let a3 = &[1, 2, 3];

let f = |a, b| a - b;
a1.fold(10, f)  //=> f(10, 1)
a2.fold(10, f)  //=> f(f(10, 1), 2)
a3.fold(10, f)  //=> f(f(f(10, 1), 2), 3)
```

example:

```rust

fn main() {
    let slice = &[2, 2, 2, 2, 2];
    let folded = slice.fold(0, |a, b| a + b);
    assert(folded == 10);
}

```

### reduce

Same as fold, but uses the first element as the starting element.

```rust
fn reduce<Env>(self, f: fn[Env](T, T) -> T) -> T
```

example:

```rust
fn main() {
    let slice = &[2, 2, 2, 2, 2];
    let reduced = slice.reduce(|a, b| a + b);
    assert(reduced == 10);
}
```

### filter

Returns a new slice containing only elements for which the given predicate returns true.

```rust
fn filter<Env>(self, f: fn[Env](T) -> bool) -> Self
```

example:

```rust
fn main() {
    let slice = &[1, 2, 3, 4, 5];
    let odds = slice.filter(|x| x % 2 == 1);
    assert_eq(odds, &[1, 3, 5]);
}
```

### join

Flatten each element in the slice into one value, separated by `separator`.

Note that although slices implement `Append`, `join` cannot be used on slice
elements since nested slices are prohibited.

```rust
fn join(self, separator: T) -> T where T: Append
```

example:

```rust
struct Accumulator {
    total: Field,
}

// "Append" two accumulators by adding them
impl Append for Accumulator {
    fn empty() -> Self {
        Self { total: 0 }
    }

    fn append(self, other: Self) -> Self {
        Self { total: self.total + other.total }
    }
}

fn main() {
    let slice = &[1, 2, 3, 4, 5].map(|total| Accumulator { total });

    let result = slice.join(Accumulator::empty());
    assert_eq(result, Accumulator { total: 15 });

    // We can use a non-empty separator to insert additional elements to sum:
    let separator = Accumulator { total: 10 };
    let result = slice.join(separator);
    assert_eq(result, Accumulator { total: 55 });
}
```

### all

Returns true if all the elements satisfy the given predicate

```rust
fn all<Env>(self, predicate: fn[Env](T) -> bool) -> bool
```

example:

```rust
fn main() {
    let slice = &[2, 2, 2, 2, 2];
    let all = slice.all(|a| a == 2);
    assert(all);
}
```

### any

Returns true if any of the elements satisfy the given predicate

```rust
fn any<Env>(self, predicate: fn[Env](T) -> bool) -> bool
```

example:

```rust
fn main() {
    let slice = &[2, 2, 2, 2, 5];
    let any = slice.any(|a| a == 5);
    assert(any);
}

```
---
title: Integers
description: Explore the Integer data type in Noir. Learn about its methods, see real-world examples, and grasp how to efficiently use Integers in your Noir code.
keywords: [noir, integer types, methods, examples, arithmetic]
sidebar_position: 1
---

An integer type is a range constrained field type.
The Noir frontend supports both unsigned and signed integer types.
The allowed sizes are 1, 8, 16, 32 and 64 bits.

:::info

When an integer is defined in Noir without a specific type, it will default to `Field`.

The one exception is for loop indices which default to `u64` since comparisons on `Field`s are not possible.

:::

## Unsigned Integers

An unsigned integer type is specified first with the letter `u` (indicating its unsigned nature) followed by its bit size (e.g. `8`):

```rust
fn main() {
    let x: u8 = 1;
    let y: u8 = 1;
    let z = x + y;
    assert (z == 2);
}
```

The bit size determines the maximum value the integer type can store. For example, a `u8` variable can store a value in the range of 0 to 255 (i.e. $\\2^{8}-1\\$).

## Signed Integers

A signed integer type is specified first with the letter `i` (which stands for integer) followed by its bit size (e.g. `8`):

```rust
fn main() {
    let x: i8 = -1;
    let y: i8 = -1;
    let z = x + y;
    assert (z == -2);
}
```

The bit size determines the maximum and minimum range of value the integer type can store. For example, an `i8` variable can store a value in the range of -128 to 127 (i.e. $\\-2^{7}\\$ to $\\2^{7}-1\\$).


```rust
fn main(x: i16, y: i16) {
    // modulo
    let c = x % y;
    let c = x % -13;
}
```

Modulo operation is defined for negative integers thanks to integer division, so that the equality `x = (x/y)*y + (x%y)` holds.

## 128 bits Unsigned Integers

The built-in structure `U128` allows you to use 128-bit unsigned integers almost like a native integer type. However, there are some differences to keep in mind:
- You cannot cast between a native integer and `U128`
- There is a higher performance cost when using `U128`, compared to a native type.

Conversion between unsigned integer types and U128 are done through the use of `from_integer` and `to_integer` functions. `from_integer` also accepts the `Field` type as input.

```rust
fn main() {
    let x = U128::from_integer(23);
    let y = U128::from_hex("0x7");
    let z = x + y;
    assert(z.to_integer() == 30);
}
```

`U128` is implemented with two 64 bits limbs, representing the low and high bits, which explains the performance cost. You should expect `U128` to be twice more costly for addition and four times more costly for multiplication.
You can construct a U128 from its limbs:
```rust
fn main(x: u64, y: u64) {
    let z = U128::from_u64s_be(x,y);
    assert(z.hi == x as Field);
    assert(z.lo == y as Field);
}
```

Note that the limbs are stored as Field elements in order to avoid unnecessary conversions.
Apart from this, most operations will work as usual:

```rust
fn main(x: U128, y: U128) {
    // multiplication
    let c = x * y;
    // addition and subtraction
    let c = c - x + y;
    // division
    let c = x / y;
    // bit operation;
    let c = x & y | y;
    // bit shift
    let c = x << y;
    // comparisons;
    let c = x < y;
    let c = x == y;
}
```

## Overflows

Computations that exceed the type boundaries will result in overflow errors. This happens with both signed and unsigned integers. For example, attempting to prove:

```rust
fn main(x: u8, y: u8) {
    let z = x + y;
}
```

With:

```toml
x = "255"
y = "1"
```

Would result in:

```
$ nargo execute
error: Assertion failed: 'attempt to add with overflow'
┌─ ~/src/main.nr:9:13
│
│     let z = x + y;
│             -----
│
= Call stack:
  ...
```

A similar error would happen with signed integers:

```rust
fn main() {
    let x: i8 = -118;
    let y: i8 = -11;
    let z = x + y;
}
```

### Wrapping methods

Although integer overflow is expected to error, some use-cases rely on wrapping. For these use-cases, the standard library provides `wrapping` variants of certain common operations:

```rust
fn wrapping_add<T>(x: T, y: T) -> T;
fn wrapping_sub<T>(x: T, y: T) -> T;
fn wrapping_mul<T>(x: T, y: T) -> T;
```

Example of how it is used:

```rust

fn main(x: u8, y: u8) -> pub u8 {
    std::wrapping_add(x, y)
}
```
---
title: Fields
description:
  Dive deep into the Field data type in Noir. Understand its methods, practical examples, and best practices to effectively use Fields in your Noir programs.
keywords:
  [
    noir,
    field type,
    methods,
    examples,
    best practices,
  ]
sidebar_position: 0
---

The field type corresponds to the native field type of the proving backend.

The size of a Noir field depends on the elliptic curve's finite field for the proving backend
adopted. For example, a field would be a 254-bit integer when paired with the default backend that
spans the Grumpkin curve.

Fields support integer arithmetic and are often used as the default numeric type in Noir:

```rust
fn main(x : Field, y : Field)  {
    let z = x + y;
}
```

`x`, `y` and `z` are all private fields in this example. Using the `let` keyword we defined a new
private value `z` constrained to be equal to `x + y`.

If proving efficiency is of priority, fields should be used as a default for solving problems.
Smaller integer types (e.g. `u64`) incur extra range constraints.

## Methods

After declaring a Field, you can use these common methods on it:

### to_le_bits

Transforms the field into an array of bits, Little Endian.

#include_code to_le_bits noir_stdlib/src/field/mod.nr rust

example:

#include_code to_le_bits_example noir_stdlib/src/field/mod.nr rust


### to_be_bits

Transforms the field into an array of bits, Big Endian.

#include_code to_be_bits noir_stdlib/src/field/mod.nr rust

example:

#include_code to_be_bits_example noir_stdlib/src/field/mod.nr rust


### to_le_bytes

Transforms into an array of bytes, Little Endian

#include_code to_le_bytes noir_stdlib/src/field/mod.nr rust

example:

#include_code to_le_bytes_example noir_stdlib/src/field/mod.nr rust

### to_be_bytes

Transforms into an array of bytes, Big Endian

#include_code to_be_bytes noir_stdlib/src/field/mod.nr rust

example:

#include_code to_be_bytes_example noir_stdlib/src/field/mod.nr rust


### to_le_radix

Decomposes into an array over the specified base, Little Endian

#include_code to_le_radix noir_stdlib/src/field/mod.nr rust


example:

#include_code to_le_radix_example noir_stdlib/src/field/mod.nr rust


### to_be_radix

Decomposes into an array over the specified base, Big Endian

#include_code to_be_radix noir_stdlib/src/field/mod.nr rust

example:

#include_code to_be_radix_example noir_stdlib/src/field/mod.nr rust


### pow_32

Returns the value to the power of the specified exponent

```rust
fn pow_32(self, exponent: Field) -> Field
```

example:

```rust
fn main() {
    let field = 2
    let pow = field.pow_32(4);
    assert(pow == 16);
}
```

### assert_max_bit_size

Adds a constraint to specify that the field can be represented with `bit_size` number of bits

#include_code assert_max_bit_size noir_stdlib/src/field/mod.nr rust

example:

```rust
fn main() {
    let field = 2
    field.assert_max_bit_size::<32>();
}
```

### sgn0

Parity of (prime) Field element, i.e. sgn0(x mod p) = 0 if x ∈ \{0, ..., p-1\} is even, otherwise sgn0(x mod p) = 1.

```rust
fn sgn0(self) -> u1
```


### lt

Returns true if the field is less than the other field

```rust
pub fn lt(self, another: Field) -> bool
```
---
title: Function types
sidebar_position: 10
---

Noir supports higher-order functions. The syntax for a function type is as follows:

```rust
fn(arg1_type, arg2_type, ...) -> return_type
```

Example:

```rust
fn assert_returns_100(f: fn() -> Field) { // f takes no args and returns a Field
    assert(f() == 100);
}

fn main() {
    assert_returns_100(|| 100); // ok
    assert_returns_100(|| 150); // fails
}
```

A function type also has an optional capture environment - this is necessary to support closures.
See [Lambdas](../lambdas.md) for more details.
---
title: Arrays
description:
  Dive into the Array data type in Noir. Grasp its methods, practical examples, and best practices for efficiently using Arrays in your Noir code.
keywords:
  [
    noir,
    array type,
    methods,
    examples,
    indexing,
  ]
sidebar_position: 4
---

An array is one way of grouping together values into one compound type. Array types can be inferred
or explicitly specified via the syntax `[<Type>; <Size>]`:

```rust
fn main(x : Field, y : Field) {
    let my_arr = [x, y];
    let your_arr: [Field; 2] = [x, y];
}
```

Here, both `my_arr` and `your_arr` are instantiated as an array containing two `Field` elements.

Array elements can be accessed using indexing:

```rust
fn main() {
    let a = [1, 2, 3, 4, 5];

    let first = a[0];
    let second = a[1];
}
```

All elements in an array must be of the same type (i.e. homogeneous). That is, an array cannot group
a `Field` value and a `u8` value together for example.

You can write mutable arrays, like:

```rust
fn main() {
    let mut arr = [1, 2, 3, 4, 5];
    assert(arr[0] == 1);

    arr[0] = 42;
    assert(arr[0] == 42);
}
```

You can instantiate a new array of a fixed size with the same value repeated for each element. The following example instantiates an array of length 32 where each element is of type Field and has the value 0.

```rust
let array: [Field; 32] = [0; 32];
```

Like in Rust, arrays in Noir are a fixed size. However, if you wish to convert an array to a [slice](./slices.mdx), you can just call `as_slice` on your array:

```rust
let array: [Field; 32] = [0; 32];
let sl = array.as_slice()
```

You can define multidimensional arrays:

```rust
let array : [[Field; 2]; 2];
let element = array[0][0];
```

However, multidimensional slices are not supported. For example, the following code will error at compile time:

```rust
let slice : [[Field]] = &[];
```

## Types

You can create arrays of primitive types or structs. There is not yet support for nested arrays
(arrays of arrays) or arrays of structs that contain arrays.

## Methods

For convenience, the STD provides some ready-to-use, common methods for arrays.
Each of these functions are located within the generic impl `impl<T, N> [T; N] {`.
So anywhere `self` appears, it refers to the variable `self: [T; N]`.

### len

Returns the length of an array

```rust
fn len(self) -> Field
```

example

```rust
fn main() {
    let array = [42, 42];
    assert(array.len() == 2);
}
```

### sort

Returns a new sorted array. The original array remains untouched. Notice that this function will
only work for arrays of fields or integers, not for any arbitrary type. This is because the sorting
logic it uses internally is optimized specifically for these values. If you need a sort function to
sort any type, you should use the function `sort_via` described below.

```rust
fn sort(self) -> [T; N]
```

example

```rust
fn main() {
    let arr = [42, 32];
    let sorted = arr.sort();
    assert(sorted == [32, 42]);
}
```

### sort_via

Sorts the array with a custom comparison function. The ordering function must return true if the first argument should be sorted to be before the second argument or is equal to the second argument.

Using this method with an operator like `<` that does not return `true` for equal values will result in an assertion failure for arrays with equal elements.

```rust
fn sort_via(self, ordering: fn(T, T) -> bool) -> [T; N]
```

example

```rust
fn main() {
    let arr = [42, 32]
    let sorted_ascending = arr.sort_via(|a, b| a <= b);
    assert(sorted_ascending == [32, 42]); // verifies

    let sorted_descending = arr.sort_via(|a, b| a >= b);
    assert(sorted_descending == [32, 42]); // does not verify
}
```

### map

Applies a function to each element of the array, returning a new array containing the mapped elements.

```rust
fn map<U>(self, f: fn(T) -> U) -> [U; N]
```

example

```rust
let a = [1, 2, 3];
let b = a.map(|a| a * 2); // b is now [2, 4, 6]
```

### fold

Applies a function to each element of the array, returning the final accumulated value. The first
parameter is the initial value.

```rust
fn fold<U>(self, mut accumulator: U, f: fn(U, T) -> U) -> U
```

This is a left fold, so the given function will be applied to the accumulator and first element of
the array, then the second, and so on. For a given call the expected result would be equivalent to:

```rust
let a1 = [1];
let a2 = [1, 2];
let a3 = [1, 2, 3];

let f = |a, b| a - b;
a1.fold(10, f)  //=> f(10, 1)
a2.fold(10, f)  //=> f(f(10, 1), 2)
a3.fold(10, f)  //=> f(f(f(10, 1), 2), 3)
```

example:

```rust

fn main() {
    let arr = [2, 2, 2, 2, 2];
    let folded = arr.fold(0, |a, b| a + b);
    assert(folded == 10);
}

```

### reduce

Same as fold, but uses the first element as the starting element.

Requires `self` to be non-empty.

```rust
fn reduce(self, f: fn(T, T) -> T) -> T
```

example:

```rust
fn main() {
    let arr = [2, 2, 2, 2, 2];
    let reduced = arr.reduce(|a, b| a + b);
    assert(reduced == 10);
}
```

### all

Returns true if all the elements satisfy the given predicate

```rust
fn all(self, predicate: fn(T) -> bool) -> bool
```

example:

```rust
fn main() {
    let arr = [2, 2, 2, 2, 2];
    let all = arr.all(|a| a == 2);
    assert(all);
}
```

### any

Returns true if any of the elements satisfy the given predicate

```rust
fn any(self, predicate: fn(T) -> bool) -> bool
```

example:

```rust
fn main() {
    let arr = [2, 2, 2, 2, 5];
    let any = arr.any(|a| a == 5);
    assert(any);
}
```

### as_str_unchecked

Converts a byte array of type `[u8; N]` to a string. Note that this performs no UTF-8 validation -
the given array is interpreted as-is as a string.

```rust
impl<let N: u32> [u8; N] {
    pub fn as_str_unchecked(self) -> str<N>
}
```

example:

```rust
fn main() {
    let hi = [104, 105].as_str_unchecked();
    assert_eq(hi, "hi");
}
```
---
title: References
sidebar_position: 9
---

Noir supports first-class references. References are a bit like pointers: they point to a specific address that can be followed to access the data stored at that address. You can use Rust-like syntax to use pointers in Noir: the `&` operator references the variable, the `*` operator dereferences it.

Example:

```rust
fn main() {
    let mut x = 2;

    // you can reference x as &mut and pass it to multiplyBy2
    multiplyBy2(&mut x);
}

// you can access &mut here
fn multiplyBy2(x: &mut Field) {
    // and dereference it with *
    *x = *x * 2;
}
```
---
title: Workspaces
sidebar_position: 3
---

Workspaces are a feature of nargo that allow you to manage multiple related Noir packages in a single repository. A workspace is essentially a group of related projects that share common build output directories and configurations.

Each Noir project (with it's own Nargo.toml file) can be thought of as a package. Each package is expected to contain exactly one "named circuit", being the "name" defined in Nargo.toml with the program logic defined in `./src/main.nr`.

For a project with the following structure:

```tree
├── crates
│   ├── a
│   │   ├── Nargo.toml
│   │   └── Prover.toml
│   │   └── src
│   │       └── main.nr
│   └── b
│       ├── Nargo.toml
│       └── Prover.toml
│       └── src
│           └── main.nr
│
└── Nargo.toml
```

You can define a workspace in Nargo.toml like so:

```toml
[workspace]
members = ["crates/a", "crates/b"]
default-member = "crates/a"
```

`members` indicates which packages are included in the workspace. As such, all member packages of a workspace will be processed when the `--workspace` flag is used with various commands or if a `default-member` is not specified. The `--package` option can be used to limit
the scope of some commands to a specific member of the workspace; otherwise these commands run on the package nearest on the path to the
current directory where `nargo` was invoked.

`default-member` indicates which package various commands process by default.

Libraries can be defined in a workspace. Inside a workspace, these are consumed as `{ path = "../to_lib" }` dependencies in Nargo.toml.

Inside a workspace, these are consumed as `{ path = "../to_lib" }` dependencies in Nargo.toml.

Please note that nesting regular packages is not supported: certain commands work on the workspace level and will use the topmost Nargo.toml file they can find on the path; unless this is a workspace configuration with `members`, the command might run on some unintended package.
---
title: Crates and Packages
description: Learn how to use Crates and Packages in your Noir project
keywords: [Nargo, dependencies, package management, crates, package]
sidebar_position: 0
---

## Crates

A crate is the smallest amount of code that the Noir compiler considers at a time.
Crates can contain modules, and the modules may be defined in other files that get compiled with the crate, as we’ll see in the coming sections.

### Crate Types

A Noir crate can come in several forms: binaries, libraries or contracts.

#### Binaries

_Binary crates_ are programs which you can compile to an ACIR circuit which you can then create proofs against. Each must have a function called `main` that defines the ACIR circuit which is to be proved.

#### Libraries

_Library crates_ don't have a `main` function and they don't compile down to ACIR. Instead they define functionality intended to be shared with multiple projects, and eventually included in a binary crate.

#### Contracts

Contract crates are similar to binary crates in that they compile to ACIR which you can create proofs against. They are different in that they do not have a single `main` function, but are a collection of functions to be deployed to the [Aztec network](https://aztec.network). You can learn more about the technical details of Aztec in the [monorepo](https://github.com/AztecProtocol/aztec-packages) or contract [examples](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts).

### Crate Root

Every crate has a root, which is the source file that the compiler starts, this is also known as the root module. The Noir compiler does not enforce any conditions on the name of the file which is the crate root, however if you are compiling via Nargo the crate root must be called `lib.nr` or `main.nr` for library or binary crates respectively.

## Packages

A Nargo _package_ is a collection of one of more crates that provides a set of functionality. A package must include a Nargo.toml file.

A package _must_ contain either a library or a binary crate, but not both.

### Differences from Cargo Packages

One notable difference between Rust's Cargo and Noir's Nargo is that while Cargo allows a package to contain an unlimited number of binary crates and a single library crate, Nargo currently only allows a package to contain a single crate.

In future this restriction may be lifted to allow a Nargo package to contain both a binary and library crate or multiple binary crates.
---
title: Modules
description:
  Learn how to organize your files using modules in Noir, following the same convention as Rust's
  module system. Examples included.
keywords: [Noir, Rust, modules, organizing files, sub-modules]
sidebar_position: 2
---

Noir's module system follows the same convention as the _newer_ version of Rust's module system.

## Purpose of Modules

Modules are used to organize files. Without modules all of your code would need to live in a single
file. In Noir, the compiler does not automatically scan all of your files to detect modules. This
must be done explicitly by the developer.

## Examples

### Importing a module in the crate root

Filename : `src/main.nr`

```rust
mod foo;

fn main() {
    foo::hello_world();
}
```

Filename : `src/foo.nr`

```rust
fn from_foo() {}
```

In the above snippet, the crate root is the `src/main.nr` file. The compiler sees the module
declaration `mod foo` which prompts it to look for a foo.nr file.

Visually this module hierarchy looks like the following :

```
crate
 ├── main
 │
 └── foo
      └── from_foo

```

The module filename may also be the name of the module as a directory with the contents in a 
file named `mod.nr` within that directory. The above example can alternatively be expressed like this:

Filename : `src/main.nr`

```rust
mod foo;

fn main() {
    foo::hello_world();
}
```

Filename : `src/foo/mod.nr`

```rust
fn from_foo() {}
```

Note that it's an error to have both files `src/foo.nr` and `src/foo/mod.nr` in the filesystem.

### Importing a module throughout the tree

All modules are accessible from the `crate::` namespace.

```
crate
 ├── bar
 ├── foo
 └── main

```

In the above snippet, if `bar` would like to use functions in `foo`, it can do so by `use crate::foo::function_name`.

### Sub-modules

Filename : `src/main.nr`

```rust
mod foo;

fn main() {
    foo::from_foo();
}
```

Filename : `src/foo.nr`

```rust
mod bar;
fn from_foo() {}
```

Filename : `src/foo/bar.nr`

```rust
fn from_bar() {}
```

In the above snippet, we have added an extra module to the module tree; `bar`. `bar` is a submodule
of `foo` hence we declare bar in `foo.nr` with `mod bar`. Since `foo` is not the crate root, the
compiler looks for the file associated with the `bar` module in `src/foo/bar.nr`

Visually the module hierarchy looks as follows:

```
crate
 ├── main
 │
 └── foo
      ├── from_foo
      └── bar
           └── from_bar
```

Similar to importing a module in the crate root, modules can be placed in a `mod.nr` file, like this:

Filename : `src/main.nr`

```rust
mod foo;

fn main() {
    foo::from_foo();
}
```

Filename : `src/foo/mod.nr`

```rust
mod bar;
fn from_foo() {}
```

Filename : `src/foo/bar/mod.nr`

```rust
fn from_bar() {}
```

### Referencing a parent module 

Given a submodule, you can refer to its parent module using the `super` keyword.

Filename : `src/main.nr`

```rust
mod foo;

fn main() {
    foo::from_foo();
}
```

Filename : `src/foo.nr`

```rust
mod bar;

fn from_foo() {}
```

Filename : `src/foo/bar.nr`

```rust
// Same as bar::from_foo
use super::from_foo; 

fn from_bar() {
    from_foo();        // invokes super::from_foo(), which is bar::from_foo()
    super::from_foo(); // also invokes bar::from_foo()
}
```

### `use` visibility

`use` declarations are private to the containing module, by default. However, like functions, 
they can be marked as `pub` or `pub(crate)`. Such a use declaration serves to _re-export_ a name. 
A public `use` declaration can therefore redirect some public name to a different target definition: 
even a definition with a private canonical path, inside a different module.

An example of re-exporting:

```rust
mod some_module {
    pub use foo::{bar, baz};
    mod foo {
        pub fn bar() {}
        pub fn baz() {}
    }
}

fn main() {
    some_module::bar();
    some_module::baz();
}
```

In this example, the module `some_module` re-exports two public names defined in `foo`.

### Visibility

By default, like functions, modules are private to the module (or crate) they exist in. You can use `pub`
to make the module public or `pub(crate)` to make it public to just its crate:

```rust
// This module is now public and can be seen by other crates.
pub mod foo;
```---
title: Dependencies
description:
  Learn how to specify and manage dependencies in Nargo, allowing you to upload packages to GitHub
  and use them easily in your project.
keywords: [Nargo, dependencies, GitHub, package management, versioning]
sidebar_position: 1
---

Nargo allows you to upload packages to GitHub and use them as dependencies.

## Specifying a dependency

Specifying a dependency requires a tag to a specific commit and the git url to the url containing
the package.

Currently, there are no requirements on the tag contents. If requirements are added, it would follow
semver 2.0 guidelines.

> Note: Without a `tag` , there would be no versioning and dependencies would change each time you
> compile your project.

For example, to add the [ecrecover-noir library](https://github.com/colinnielsen/ecrecover-noir) to your project, add it to `Nargo.toml`:

```toml
# Nargo.toml

[dependencies]
ecrecover = {tag = "v0.8.0", git = "https://github.com/colinnielsen/ecrecover-noir"}
```

If the module is in a subdirectory, you can define a subdirectory in your git repository, for example:

```toml
# Nargo.toml

[dependencies]
easy_private_token_contract = {tag ="v0.1.0-alpha62", git = "https://github.com/AztecProtocol/aztec-packages", directory = "noir-contracts/contracts/easy_private_token_contract"}
```

## Specifying a local dependency

You can also specify dependencies that are local to your machine.

For example, this file structure has a library and binary crate

```tree
├── binary_crate
│   ├── Nargo.toml
│   └── src
│       └── main.nr
└── lib_a
    ├── Nargo.toml
    └── src
        └── lib.nr
```

Inside of the binary crate, you can specify:

```toml
# Nargo.toml

[dependencies]
lib_a = { path = "../lib_a" }
```

## Importing dependencies

You can import a dependency to a Noir file using the following syntax. For example, to import the
ecrecover-noir library and local lib_a referenced above:

```rust
use ecrecover;
use lib_a;
```

You can also import only the specific parts of dependency that you want to use, like so:

```rust
use std::hash::sha256;
use std::scalar_mul::fixed_base_embedded_curve;
```

Lastly, You can import multiple items in the same line by enclosing them in curly braces:

```rust
use std::hash::{keccak256, sha256};
```

We don't have a way to consume libraries from inside a [workspace](./workspaces.md) as external dependencies right now.

Inside a workspace, these are consumed as `{ path = "../to_lib" }` dependencies in Nargo.toml.

## Dependencies of Dependencies

Note that when you import a dependency, you also get access to all of the dependencies of that package.

For example, the [phy_vector](https://github.com/resurgencelabs/phy_vector) library imports an [fraction](https://github.com/resurgencelabs/fraction) library. If you're importing the phy_vector library, then you can access the functions in fractions library like so:

```rust
use phy_vector;

fn main(x : Field, y : pub Field) {
  //...
  let f = phy_vector::fraction::toFraction(true, 2, 1);
  //...
}
```

## Available Libraries

Noir does not currently have an official package manager. You can find a list of available Noir libraries in the [awesome-noir repo here](https://github.com/noir-lang/awesome-noir#libraries).

Some libraries that are available today include:

- [Standard Library](https://github.com/noir-lang/noir/tree/master/noir_stdlib) - the Noir Standard Library
- [Ethereum Storage Proof Verification](https://github.com/aragonzkresearch/noir-trie-proofs) - a library that contains the primitives necessary for RLP decoding (in the form of look-up table construction) and Ethereum state and storage proof verification (or verification of any trie proof involving 32-byte long keys)
- [BigInt](https://github.com/shuklaayush/noir-bigint) - a library that provides a custom BigUint56 data type, allowing for computations on large unsigned integers
- [ECrecover](https://github.com/colinnielsen/ecrecover-noir/tree/main) - a library to verify an ECDSA signature and return the source Ethereum address
- [Sparse Merkle Tree Verifier](https://github.com/vocdoni/smtverifier-noir/tree/main) - a library for verification of sparse Merkle trees
- [Signed Int](https://github.com/resurgencelabs/signed_int) - a library for accessing a custom Signed Integer data type, allowing access to negative numbers on Noir
- [Fraction](https://github.com/resurgencelabs/fraction) - a library for accessing fractional number data type in Noir, allowing results that aren't whole numbers
---
title: Testing in Noir
description: Learn how to use Nargo to test your Noir program in a quick and easy way
keywords: [Nargo, testing, Noir, compile, test]
sidebar_position: 1
---

You can test your Noir programs using Noir circuits.

Nargo will automatically compile and run any functions which have the decorator `#[test]` on them if
you run `nargo test`.

For example if you have a program like:

```rust
fn add(x: u64, y: u64) -> u64 {
    x + y
}
#[test]
fn test_add() {
    assert(add(2,2) == 4);
    assert(add(0,1) == 1);
    assert(add(1,0) == 1);
}
```

Running `nargo test` will test that the `test_add` function can be executed while satisfying all
the constraints which allows you to test that add returns the expected values. Test functions can't
have any arguments currently.

### Test fail

You can write tests that are expected to fail by using the decorator `#[test(should_fail)]`. For example:

```rust
fn add(x: u64, y: u64) -> u64 {
    x + y
}
#[test(should_fail)]
fn test_add() {
    assert(add(2,2) == 5);
}
```

You can be more specific and make it fail with a specific reason by using `should_fail_with = "<the reason for failure>"`:

```rust
fn main(african_swallow_avg_speed : Field) {
    assert(african_swallow_avg_speed == 65, "What is the airspeed velocity of an unladen swallow");
}

#[test]
fn test_king_arthur() {
    main(65);
}

#[test(should_fail_with = "What is the airspeed velocity of an unladen swallow")]
fn test_bridgekeeper() {
    main(32);
}
```

The string given to `should_fail_with` doesn't need to exactly match the failure reason, it just needs to be a substring of it:

```rust
fn main(african_swallow_avg_speed : Field) {
    assert(african_swallow_avg_speed == 65, "What is the airspeed velocity of an unladen swallow");
}

#[test]
fn test_king_arthur() {
    main(65);
}

#[test(should_fail_with = "airspeed velocity")]
fn test_bridgekeeper() {
    main(32);
}
```---
title: Debugger
description: Learn about the Noir Debugger, in its REPL or VS Code versions.
keywords: [Nargo, VSCode, Visual Studio Code, REPL, Debugger]
sidebar_position: 2
---

# Noir Debugger

There are currently two ways of debugging Noir programs:

1. From VS Code, via the [vscode-noir](https://github.com/noir-lang/vscode-noir) extension. You can install it via the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir).
2. Via the REPL debugger, which ships with Nargo.

In order to use either version of the debugger, you will need to install recent enough versions of Noir, [Nargo](../getting_started/noir_installation.md) and vscode-noir:

- Noir & Nargo ≥0.28.0
- Noir's VS Code extension ≥0.0.11

:::info
At the moment, the debugger supports debugging binary projects, but not contracts.
:::

We cover the VS Code Noir debugger more in depth in [its VS Code debugger how-to guide](../how_to/debugger/debugging_with_vs_code.md) and [the reference](../reference/debugger/debugger_vscode.md).

The REPL debugger is discussed at length in [the REPL debugger how-to guide](../how_to/debugger/debugging_with_the_repl.md) and [the reference](../reference/debugger/debugger_repl.md).
---
title: Language Server
description: Learn about the Noir Language Server, how to install the components, and configuration that may be required.
keywords: [Nargo, Language Server, LSP, VSCode, Visual Studio Code]
sidebar_position: 0
---

This section helps you install and configure the Noir Language Server.

The Language Server Protocol (LSP) has two components, the [Server](#language-server) and the [Client](#language-client). Below we describe each in the context of Noir.

## Language Server

The Server component is provided by the Nargo command line tool that you installed at the beginning of this guide.
As long as Nargo is installed and you've used it to run other commands in this guide, it should be good to go!

If you'd like to verify that the `nargo lsp` command is available, you can run `nargo --help` and look for `lsp` in the list of commands. If you see it, you're using a version of Noir with LSP support.

## Language Client

The Client component is usually an editor plugin that launches the Server. It communicates LSP messages between the editor and the Server. For example, when you save a file, the Client will alert the Server, so it can try to compile the project and report any errors.

Currently, Noir provides a Language Client for Visual Studio Code via the [vscode-noir](https://github.com/noir-lang/vscode-noir) extension. You can install it via the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=noir-lang.vscode-noir).

> **Note:** Noir's Language Server Protocol support currently assumes users' VSCode workspace root to be the same as users' Noir project root (i.e. where Nargo.toml lies).
>
> If LSP features seem to be missing / malfunctioning, make sure you are opening your Noir project directly (instead of as a sub-folder) in your VSCode instance.

When your language server is running correctly and the VSCode plugin is installed, you should see handy codelens buttons for compilation, measuring circuit size, execution, and tests:

![Compile and Execute](@site/static/img/codelens_compile_execute.png)
![Run test](@site/static/img/codelens_run_test.png)

You should also see your tests in the `testing` panel:

![Testing panel](@site/static/img/codelens_testing_panel.png)

### Configuration

- **Noir: Enable LSP** - If checked, the extension will launch the Language Server via `nargo lsp` and communicate with it.
- **Noir: Nargo Flags** - Additional flags may be specified if you require them to be added when the extension calls `nargo lsp`.
- **Noir: Nargo Path** - An absolute path to a Nargo binary with the `lsp` command. This may be useful if Nargo is not within the `PATH` of your editor.
- **Noir > Trace: Server** - Setting this to `"messages"` or `"verbose"` will log LSP messages between the Client and Server. Useful for debugging.
---
title: Thinking in Circuits
description: Considerations when writing Noir programs
keywords: [Noir, programming, rust]
tags: [Optimization]
sidebar_position: 0
---


This article intends to set you up with key concepts essential for writing more viable applications that use zero knowledge proofs, namely around efficient circuits.

## Context - 'Efficient' is subjective

When writing a web application for a performant computer with high-speed internet connection, writing efficient code sometimes is seen as an afterthought only if needed. Large multiplications running at the innermost of nested loops may not even be on a dev's radar.
When writing firmware for a battery-powered microcontroller, you think of cpu cycles as rations to keep within a product's power budget.

> Code is written to create applications that perform specific tasks within specific constraints

And these constraints differ depending on where the compiled code is execute.

### The Ethereum Virtual Machine (EVM)

In scenarios where extremely low gas costs are required for an Ethereum application to be viable/competitive, Ethereum smart contract developers get into what is colloquially known as: "*gas golfing*". Finding the lowest execution cost of their compiled code (EVM bytecode) to achieve a specific task.

The equivalent optimization task when writing zk circuits is affectionately referred to as "*gate golfing*", finding the lowest gate representation of the compiled Noir code.

### Coding for circuits - a paradigm shift

In zero knowledge cryptography, code is compiled to "circuits" consisting of arithmetic gates, and gate count is the significant cost. Depending on the proving system this is linearly proportionate to proving time, and so from a product point this should be kept as low as possible.

Whilst writing efficient code for web apps and Solidity has a few key differences, writing efficient circuits have a different set of considerations. It is a bit of a paradigm shift, like writing code for GPUs for the first time...

For example, drawing a circle at (0, 0) of radius `r`:
- For a single CPU thread,
```
for theta in 0..2*pi {
  let x = r * cos(theta);
  let y = r * sin(theta);
  draw(x, y);
} // note: would do 0 - pi/2 and draw +ve/-ve x and y.
```

- For GPUs (simultaneous parallel calls with x, y across image),
```
if (x^2 + y^2 = r^2) {
  draw(x, y);
}
```

([Related](https://www.youtube.com/watch?v=-P28LKWTzrI))

Whilst this CPU -> GPU does not translate to circuits exactly, it is intended to exemplify the difference in intuition when coding for different machine capabilities/constraints.

### Context Takeaway

For those coming from a primarily web app background, this article will explain what you need to consider when writing circuits. Furthermore, for those experienced writing efficient machine code, prepare to shift what you think is efficient 😬

## Translating from Rust

For some applications using Noir, existing code might be a convenient starting point to then proceed to optimize the gate count of.

:::note
Many valuable functions and algorithms have been written in more established languages (C/C++), and converted to modern ones (like Rust).
:::

Fortunately for Noir developers, when needing a particular function a Rust implementation can be readily compiled into Noir with some key changes. While the compiler does a decent amount of optimizations, it won't be able to change code that has been optimized for clock-cycles into code optimized for arithmetic gates.

A few things to do when converting Rust code to Noir:
- `println!` is not a macro, use `println` function (same for `assert_eq`)
- No early `return` in function. Use constrain via assertion instead
- No passing by reference. Remove `&` operator to pass by value (copy)
- No boolean operators (`&&`, `||`). Use bitwise operators (`&`, `|`) with boolean values
- No type `usize`. Use types `u8`, `u32`, `u64`, ... 
- `main` return must be public, `pub`
- No `const`, use `global`
- Noir's LSP is your friend, so error message should be informative enough to resolve syntax issues.

## Writing efficient Noir for performant products

The following points help refine our understanding over time.

:::note
A Noir program makes a statement that can be verified.
:::

It compiles to a structure that represents the calculation, and can assert results within the calculation at any stage (via the `constrain` keyword).

A Noir program compiles to an Abstract Circuit Intermediate Representation which is:
 - Conceptually a tree structure
 - Leaves (inputs) are the `Field` type
 - Nodes contain arithmetic operations to combine them (gates)
 - The root is the final result (return value)

:::tip
The command `nargo info` shows the programs circuit size, and is useful to compare the value of changes made.
You can dig deeper and use the `--print-acir` param to take a closer look at individual ACIR opcodes, and the proving backend to see its gate count (eg for barretenberg, `bb gates -b ./target/program.json`).
:::

### Use the `Field` type

Since the native type of values in circuits are `Field`s, using them for variables in Noir means less gates converting them under the hood.
Some things to be mindful of when using a Field type for a regular integer value:
- A variable of type `Field` can be cast `as` an integer type (eg `u8`, `u64`)
  - Note: this retains only the bits of the integer type. Eg a Field value of 260 as a `u8` becomes 4
- For Field types arithmetic operations meaningfully overflow/underflow, yet for integer types they are checked according to their size
- Comparisons and bitwise operations do not exist for `Field`s, cast to an appropriately sized integer type when you need to

:::tip
Where possible, use `Field` type for values. Using smaller value types, and bit-packing strategies, will result in MORE gates
:::


### Use Arithmetic over non-arithmetic operations

Since circuits are made of arithmetic gates, the cost of arithmetic operations tends to be one gate. Whereas for procedural code, they represent several clock cycles.

Inversely, non-arithmetic operators are achieved with multiple gates, vs 1 clock cycle for procedural code.

| (cost\op)  | arithmetic<br>(`*`, `+`) | bit-wise ops<br>(eg `<`, `\|`, `>>`) |
| - | - | - |
| **cycles** | 10+ | 1 |
| **gates**  | 1 | 10+ |

Bit-wise operations (e.g. bit shifts `<<` and `>>`), albeit commonly used in general programming and especially for clock cycle optimizations, are on the contrary expensive in gates when performed within circuits.

Translate away from bit shifts when writing constrained functions for the best performance.

On the flip side, feel free to use bit shifts in unconstrained functions and tests if necessary, as they are executed outside of circuits and does not induce performance hits.

### Use static over dynamic values

Another general theme that manifests in different ways is that static reads are represented with less gates than dynamic ones.

Reading from read-only memory (ROM) adds less gates than random-access memory (RAM), 2 vs ~3.25 due to the additional bounds checks. Arrays of fixed length (albeit used at a lower capacity), will generate less gates than dynamic storage.

Related to this, if an index used to access an array is not known at compile time (ie unknown until run time), then ROM will be converted to RAM, expanding the gate count.

:::tip
Use arrays and indices that are known at compile time where possible.
Using `assert_constant(i);` before an index, `i`, is used in an array will give a compile error if `i` is NOT known at compile time.
:::

### Reduce what is inside loops and conditional logic

Putting less logic  inside an `if` (`else`, etc) paths, or inside a loop, translates to less gates required to represent the program. The compiler should mostly take care of this.

A loop duplicates the gates for each iteration of the loop, or put another way, "unrolls" the loop. Any calculations/calls that are unchanged in the loop should be calculated once before, and the result used in the loop.

An `if` statement is "flattened" and gates created for each path even if execution uses only one path. Furthermore, there are additional operations required for each path. Sometimes this can have a multiplying effect on the operations in the `if` and `else` etc.

:::tip
Only have essential computation inside conditional logic and loops, and calculate anything else once (before, or after, depending).
:::

### Leverage unconstrained execution

Constrained verification can leverage unconstrained execution, this is especially useful for operations that are represented by many gates.
Use an [unconstrained function](../noir/concepts/unconstrained.md) to perform gate-heavy calculations, then verify and constrain the result.

Eg division generates more gates than multiplication, so calculating the quotient in an unconstrained function then constraining the product for the quotient and divisor (+ any remainder) equals the dividend will be more efficient.

Use `  if is_unconstrained() { /`, to conditionally execute code if being called in an unconstrained vs constrained way.

## Advanced

Unless you're well into the depth of gate optimization, this advanced section can be ignored.

### Combine arithmetic operations

A Noir program can be honed further by combining arithmetic operators in a way that makes the most of each constraint of the backend proving system. This is in scenarios where the backend might not be doing this perfectly.

Eg Barretenberg backend (current default for Noir) is a width-4 PLONKish constraint system
$ w_1*w_2*q_m + w_1*q_1 + w_2*q_2 + w_3*q_3 + w_4*q_4 + q_c = 0 $

Here we see there is one occurrence of witness 1 and 2 ($w_1$, $w_2$) being multiplied together, with addition to witnesses 1-4 ($w_1$ .. $w_4$) multiplied by 4 corresponding circuit constants ($q_1$ .. $q_4$) (plus a final circuit constant, $q_c$).

Use `nargo info --print-acir`, to inspect the ACIR opcodes (and the proving system for gates), and it may present opportunities to amend the order of operations and reduce the number of constraints.

#### Variable as witness vs expression

If you've come this far and really know what you're doing at the equation level, a temporary lever (that will become unnecessary/useless over time) is: `std::as_witness`. This informs the compiler to save a variable as a witness not an expression.

The compiler will mostly be correct and optimal, but this may help some near term edge cases that are yet to optimize.
Note: When used incorrectly it will create **less** efficient circuits (higher gate count).

## References
- Guillaume's ["`Cryptdoku`" talk](https://www.youtube.com/watch?v=MrQyzuogxgg) (Jun'23)
- Tips from Tom, Jake and Zac.
- [Idiomatic Noir](https://www.vlayer.xyz/blog/idiomatic-noir-part-1-collections) blog post
---
title: Recursive proofs
description: Explore the concept of recursive proofs in Zero-Knowledge programming. Understand how recursion works in Noir, a language for writing smart contracts on the EVM blockchain. Learn through practical examples like Alice and Bob's guessing game, Charlie's recursive merkle tree, and Daniel's reusable components. Discover how to use recursive proofs to optimize computational resources and improve efficiency.

keywords:
  [
    "Recursive Proofs",
    "Zero-Knowledge Programming",
    "Noir",
    "EVM Blockchain",
    "Smart Contracts",
    "Recursion in Noir",
    "Alice and Bob Guessing Game",
    "Recursive Merkle Tree",
    "Reusable Components",
    "Optimizing Computational Resources",
    "Improving Efficiency",
    "Verification Key",
    "Aggregation",
    "Recursive zkSNARK schemes",
    "PLONK",
    "Proving and Verification Keys"
  ]
sidebar_position: 1
pagination_next: how_to/how-to-recursion
---

In programming, we tend to think of recursion as something calling itself. A classic example would be the calculation of the factorial of a number:

```js
function factorial(n) {
    if (n === 0 || n === 1) {
        return 1;
    } else {
        return n * factorial(n - 1);
    }
}
```

In this case, while `n` is not `1`, this function will keep calling itself until it hits the base case, bubbling up the result on the call stack:

```md
        Is `n` 1?  <---------
           /\               /
          /  \         n = n -1 
         /    \           /
       Yes     No --------
```

In Zero-Knowledge, recursion has some similarities.

It is not a Noir function calling itself, but a proof being used as an input to another circuit. In short, you verify one proof *inside* another proof, returning the proof that both proofs are valid.

This means that, given enough computational resources, you can prove the correctness of any arbitrary number of proofs in a single proof. This could be useful to design state channels (for which a common example would be [Bitcoin's Lightning Network](https://en.wikipedia.org/wiki/Lightning_Network)), to save on gas costs by settling one proof on-chain, or simply to make business logic less dependent on a consensus mechanism.

## Examples

Let us look at some of these examples

### Alice and Bob - Guessing game

Alice and Bob are friends, and they like guessing games. They want to play a guessing game online, but for that, they need a trusted third-party that knows both of their secrets and finishes the game once someone wins.

So, they use zero-knowledge proofs. Alice tries to guess Bob's number, and Bob will generate a ZK proof stating whether she succeeded or failed.

This ZK proof can go on a smart contract, revealing the winner and even giving prizes. However, this means every turn needs to be verified on-chain. This incurs some cost and waiting time that may simply make the game too expensive or time-consuming to be worth it.

As a solution, Alice proposes the following: "what if Bob generates his proof, and instead of sending it on-chain, I verify it *within* my own proof before playing my own turn?".

She can then generate a proof that she verified his proof, and so on.

```md
      Did you fail?  <--------------------------
           / \                                  /
          /   \                             n = n -1 
         /     \                              /
       Yes      No                           /
        |        |                          /
        |        |                         /
        |      You win                    /
        |                                /
        |                               /
Generate proof of that                 /
        +                             /
    my own guess     ----------------
```

### Charlie - Recursive merkle tree

Charlie is a concerned citizen, and wants to be sure his vote in an election is accounted for. He votes with a ZK proof, but he has no way of knowing that his ZK proof was included in the total vote count!

If the vote collector puts all of the votes into a [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree), everyone can prove the verification of two proofs within one proof, as such:

```md
                    abcd
           __________|______________
          |                         |
         ab                         cd 
     _____|_____              ______|______
    |           |            |             |              
  alice        bob        charlie        daniel 
```

Doing this recursively allows us to arrive on a final proof `abcd` which if true, verifies the correctness of all the votes.

### Daniel - Reusable components

Daniel has a big circuit and a big headache. A part of his circuit is a setup phase that finishes with some assertions that need to be made. But that section alone takes most of the proving time, and is largely independent of the rest of the circuit.

He might find it more efficient to generate a proof for that setup phase separately, and verify that proof recursively in the actual business logic section of his circuit. This will allow for parallelization of both proofs, which results in a considerable speedup.

## What params do I need

As you can see in the [recursion reference](noir/standard_library/recursion.mdx), a simple recursive proof requires:

- The proof to verify
- The Verification Key of the circuit that generated the proof
- A hash of this verification key, as it's needed for some backends
- The public inputs for the proof

:::info

Recursive zkSNARK schemes do not necessarily "verify a proof" in the sense that you expect a true or false to be spit out by the verifier. Rather an aggregation object is built over the public inputs.

So, taking the example of Alice and Bob and their guessing game:

- Alice makes her guess. Her proof is *not* recursive: it doesn't verify any proof within it! It's just a standard `assert(x != y)` circuit
- Bob verifies Alice's proof and makes his own guess. In this circuit, he doesn't exactly *prove* the verification of Alice's proof. Instead, he *aggregates* his proof to Alice's proof. The actual verification is done when the full proof is verified, for example when using `nargo verify` or through the verifier smart contract.

We can imagine recursive proofs a [relay race](https://en.wikipedia.org/wiki/Relay_race). The first runner doesn't have to receive the baton from anyone else, as he/she already starts with it. But when his/her turn is over, the next runner needs to receive it, run a bit more, and pass it along. Even though every runner could theoretically verify the baton mid-run (why not? 🏃🔍), only at the end of the race does the referee verify that the whole race is valid.

:::

## Some architecture

As with everything in computer science, there's no one-size-fits all. But there are some patterns that could help understanding and implementing them. To give three examples:

### Adding some logic to a proof verification

This would be an approach for something like our guessing game, where proofs are sent back and forth and are verified by each opponent. This circuit would be divided in two sections:

- A `recursive verification` section, which would be just the call to `std::verify_proof`, and that would be skipped on the first move (since there's no proof to verify)
- A `guessing` section, which is basically the logic part where the actual guessing happens

In such a situation, and assuming Alice is first, she would skip the first part and try to guess Bob's number. Bob would then verify her proof on the first section of his run, and try to guess Alice's number on the second part, and so on.

### Aggregating proofs

In some one-way interaction situations, recursion would allow for aggregation of simple proofs that don't need to be immediately verified on-chain or elsewhere.

To give a practical example, a barman wouldn't need to verify a "proof-of-age" on-chain every time he serves alcohol to a customer. Instead, the architecture would comprise two circuits:

- A `main`, non-recursive circuit with some logic
- A `recursive` circuit meant to verify two proofs in one proof

The customer's proofs would be intermediate, and made on their phones, and the barman could just verify them locally. He would then aggregate them into a final proof sent on-chain (or elsewhere) at the end of the day.

### Recursively verifying different circuits

Nothing prevents you from verifying different circuits in a recursive proof, for example:

- A `circuit1` circuit
- A `circuit2` circuit
- A `recursive` circuit

In this example, a regulator could verify that taxes were paid for a specific purchase by aggregating both a `payer` circuit (proving that a purchase was made and taxes were paid), and a `receipt` circuit (proving that the payment was received)

## How fast is it

At the time of writing, verifying recursive proofs is surprisingly fast. This is because most of the time is spent on generating the verification key that will be used to generate the next proof. So you are able to cache the verification key and reuse it later.

Currently, Noir JS packages don't expose the functionality of loading proving and verification keys, but that feature exists in the underlying `bb.js` package.

## How can I try it

Learn more about using recursion in Nargo and NoirJS in the [how-to guide](../how_to/how-to-recursion.md) and see a full example in [noir-examples](https://github.com/noir-lang/noir-examples).
---
title: Oracles
description: This guide provides an in-depth understanding of how Oracles work in Noir programming. Learn how to use outside calculations in your programs, constrain oracles, and understand their uses and limitations.
keywords:
  - Noir Programming
  - Oracles
  - JSON-RPC
  - Foreign Call Handlers
  - Constrained Functions
  - Blockchain Programming
sidebar_position: 1
---

If you've seen "The Matrix" you may recall "The Oracle" as Gloria Foster smoking cigarettes and baking cookies. While she appears to "know things", she is actually providing a calculation of a pre-determined future. Noir Oracles are similar, in a way. They don't calculate the future (yet), but they allow you to use outside calculations in your programs.

![matrix oracle prediction](@site/static/img/memes/matrix_oracle.jpeg)

A Noir program is usually self-contained. You can pass certain inputs to it, and it will generate a deterministic output for those inputs. But what if you wanted to defer some calculation to an outside process or source?

Oracles are functions that provide this feature.

## Use cases

An example usage for Oracles is proving something on-chain. For example, proving that the ETH-USDC quote was below a certain target at a certain block time. Or even making more complex proofs like proving the ownership of an NFT as an anonymous login method.

Another interesting use case is to defer expensive calculations to be made outside of the Noir program, and then constraining the result; similar to the use of [unconstrained functions](../noir/concepts//unconstrained.md).

In short, anything that can be constrained in a Noir program but needs to be fetched from an external source is a great candidate to be used in oracles.

## Constraining oracles

Just like in The Matrix, Oracles are powerful. But with great power, comes great responsibility. Just because you're using them in a Noir program doesn't mean they're true. Noir has no superpowers. If you want to prove that Portugal won the Euro Cup 2016, you're still relying on potentially untrusted information.

To give a concrete example, Alice wants to login to the [NounsDAO](https://nouns.wtf/) forum with her username "noir_nouner" by proving she owns a noun without revealing her ethereum address. Her Noir program could have an oracle call like this:

```rust
#[oracle(getNoun)]
unconstrained fn get_noun(address: Field) -> Field
```

This oracle could naively resolve with the number of Nouns she possesses. However, it is useless as a trusted source, as the oracle could resolve to anything Alice wants. In order to make this oracle call actually useful, Alice would need to constrain the response from the oracle, by proving her address and the noun count belongs to the state tree of the contract.

In short, **Oracles don't prove anything. Your Noir program does.**

:::danger

If you don't constrain the return of your oracle, you could be clearly opening an attack vector on your Noir program. Make double-triple sure that the return of an oracle call is constrained!

:::

## How to use Oracles

On CLI, Nargo resolves oracles by making JSON RPC calls, which means it would require an RPC node to be running.

In JavaScript, NoirJS accepts and resolves arbitrary call handlers (that is, not limited to JSON) as long as they match the expected types the developer defines. Refer to [Foreign Call Handler](../reference/NoirJS/noir_js/type-aliases/ForeignCallHandler.md) to learn more about NoirJS's call handling.

If you want to build using oracles, follow through to the [oracle guide](../how_to/how-to-oracles.md) for a simple example on how to do that.
---
title: Standalone Noir Installation
description: There are different ways to install Nargo, the one-stop shop and command-line tool for developing Noir programs. This guide explains how to specify which version to install when using noirup, and using WSL for windows.
keywords: [
    Installation
    Nargo
    Noirup
    Binaries
    Compiling from Source
    WSL for Windows
    macOS
    Linux
    Nix
    Direnv
    Uninstalling Nargo
  ]
sidebar_position: 2
---

Noirup is the endorsed method for installing Nargo, streamlining the process of fetching binaries or compiling from source. It supports a range of options to cater to your specific needs, from nightly builds and specific versions to compiling from various sources.

### Installing Noirup

First, ensure you have `noirup` installed:

```sh
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
```

### Fetching Binaries

With `noirup`, you can easily switch between different Nargo versions, including nightly builds:

- **Nightly Version**: Install the latest nightly build.

  ```sh
  noirup --version nightly
  ```

- **Specific Version**: Install a specific version of Nargo.

  ```sh
  noirup --version <version>
  ```

### Compiling from Source

`noirup` also enables compiling Nargo from various sources:

- **From a Specific Branch**: Install from the latest commit on a branch.

  ```sh
  noirup --branch <branch-name>
  ```

- **From a Fork**: Install from the main branch of a fork.

  ```sh
  noirup --repo <username/repo>
  ```

- **From a Specific Branch in a Fork**: Install from a specific branch in a fork.

  ```sh
  noirup --repo <username/repo> --branch <branch-name>
  ```

- **From a Specific Pull Request**: Install from a specific PR.

  ```sh
  noirup --pr <pr-number>
  ```

- **From a Specific Commit**: Install from a specific commit.

  ```sh
  noirup -C <commit-hash>
  ```

- **From Local Source**: Compile and install from a local directory.

  ```sh
  noirup --path ./path/to/local/source
  ```

## Installation on Windows

The default backend for Noir (Barretenberg) doesn't provide Windows binaries at this time. For that reason, Noir cannot be installed natively. However, it is available by using Windows Subsystem for Linux (WSL).

Step 1: Follow the instructions [here](https://learn.microsoft.com/en-us/windows/wsl/install) to install and run WSL.

step 2: Follow the [Noirup instructions](#installing-noirup).

## Setting up shell completions

Once `nargo` is installed, you can [set up shell completions for it](setting_up_shell_completions.md).

## Uninstalling Nargo

If you installed Nargo with `noirup`, you can uninstall Nargo by removing the files in `~/.nargo`, `~/nargo`, and `~/noir_cache`. This ensures that all installed binaries, configurations, and cache related to Nargo are fully removed from your system.

```bash
rm -r ~/.nargo
rm -r ~/nargo
rm -r ~/noir_cache
```
---
title: Setting up shell completions
tags: []
sidebar_position: 3
---

The `nargo` binary provides a command to generate shell completions:

```bash
nargo generate-completion-script [shell]
```

where `shell` must be one of `bash`, `elvish`, `fish`, `powershell`, and `zsh`.

Below we explain how to install them in some popular shells.

## Installing Zsh Completions

If you have `oh-my-zsh` installed, you might already have a directory of automatically loading completion scripts — `.oh-my-zsh/completions`.
If not, first create it:

```bash
mkdir -p ~/.oh-my-zsh/completions`
```

Then copy the completion script to that directory:

```bash
nargo generate-completion-script zsh > ~/.oh-my-zsh/completions/_nargo
```

Without `oh-my-zsh`, you’ll need to add a path for completion scripts to your function path, and turn on completion script auto-loading. 
First, add these lines to `~/.zshrc`:

```bash
fpath=(~/.zsh/completions $fpath)
autoload -U compinit
compinit
```

Next, create a directory at `~/.zsh/completions`:

```bash
mkdir -p ~/.zsh/completions
```

Then copy the completion script to that directory:

```bash
nargo generate-completion-script zsh > ~/.zsh/completions/_nargo
```

## Installing Bash Completions

If you have [bash-completion](https://github.com/scop/bash-completion) installed, you can just copy the completion script to the `/usr/local/etc/bash_completion.d` directory:

```bash
nargo generate-completion-script bash > /usr/local/etc/bash_completion.d/nargo
```

Without `bash-completion`, you’ll need to source the completion script directly. 
First create a directory such as `~/.bash_completions/`:

```bash
mkdir ~/.bash_completions/
```

Copy the completion script to that directory:

```bash
nargo generate-completion-script bash > ~/.bash_completions/nargo.bash
```

Then add the following line to `~/.bash_profile` or `~/.bashrc`:


```bash
source ~/.bash_completions/nargo.bash
```

## Installing Fish Completions

Copy the completion script to any path listed in the environment variable `$fish_completion_path`. For example, a typical location is `~/.config/fish/completions/nargo.fish`:

```bash
nargo generate-completion-script fish > ~/.config/fish/completions/nargo.fish
```
---
title: Quick Start
tags: []
sidebar_position: 0
---

## Installation

### Noir

The easiest way to develop with Noir is using Nargo the CLI tool. It provides you the ability to start new projects, compile, execute and test Noir programs from the terminal.

You can use `noirup` the installation script to quickly install and update Nargo:

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
noirup
```

Once installed, you can [set up shell completions for the `nargo` command](setting_up_shell_completions).

### Proving backend

After installing Noir, we install a proving backend to work with our Noir programs.

Proving backends provide you the abilities to generate proofs, verify proofs, generate smart contracts and more for your Noir programs.

Different proving backends provide different tools for working with Noir programs, here we will use the [Barretenberg proving backend](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg) developed by Aztec Labs as an example.

You can use the `bbup` installation script to quickly install and update BB, Barretenberg's CLI tool:

You can find the full list of proving backends compatible with Noir in Awesome Noir.

```bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash
bbup
```

For the full list of proving backends compatible with Noir, visit [Awesome Noir](https://github.com/noir-lang/awesome-noir/?tab=readme-ov-file#proving-backends).

## Nargo

Nargo provides the ability to initiate and execute Noir projects. Let's initialize the traditional `hello_world`:

```sh
nargo new hello_world
```

Two files will be created.

- `src/main.nr` contains a simple boilerplate circuit
- `Nargo.toml` contains environmental options, such as name, author, dependencies, and others.

Glancing at _main.nr_ , we can see that inputs in Noir are private by default, but can be labeled public using the keyword `pub`. This means that we will _assert_ that we know a value `x` which is different from `y` without revealing `x`:

```rust
fn main(x : Field, y : pub Field) {
    assert(x != y);
}
```

To learn more about private and public values, check the [Data Types](../noir/concepts/data_types/index.md) section.

### Compiling and executing

We can now use `nargo` to generate a _Prover.toml_ file, where our input values will be specified:

```sh
cd hello_world
nargo check

Let's feed some valid values into this file:

```toml
x = "1"
y = "2"
```

We're now ready to compile and execute our Noir program. By default the `nargo execute` command will do both, and generate the `witness` that we need to feed to our proving backend:

```sh
nargo execute
```

The witness corresponding to this execution will then be written to the file _./target/witness-name.gz_.

The command also automatically compiles your Noir program if it was not already / was edited, which you may notice the compiled artifacts being written to the file _./target/hello_world.json_.

With circuit compiled and witness generated, we're ready to prove.

## Proving backend

Different proving backends may provide different tools and commands to work with Noir programs. Here Barretenberg's `bb` CLI tool is used as an example:

```sh
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz -o ./target/proof
```

:::tip

Naming can be confusing, specially as you pass them to the `bb` commands. If unsure, it won't hurt to delete the target folder and start anew to make sure you're using the most recent versions of the compiled circuit and witness.

:::

The proof is now generated in the `target` folder. To verify it we first need to compute the verification key from the compiled circuit, and use it to verify:

```sh
bb write_vk -b ./target/hello_world.json -o ./target/vk
bb verify -k ./target/vk -p ./target/proof
```

:::info

Notice that in order to verify a proof, the verifier knows nothing but the circuit, which is compiled and used to generate the verification key. This is obviously quite important: private inputs remain private.

As for the public inputs, you may have noticed they haven't been specified. This behavior varies with each particular backend, but barretenberg typically attaches them to the proof. You can see them by parsing and splitting it. For example for if your public inputs are 32 bytes:

```bash
head -c 32 ./target/proof | od -An -v -t x1 | tr -d $' \n'
```

:::

Congratulations, you have now created and verified a proof for your very first Noir program!

In the [next section](./project_breakdown.md), we will go into more detail on each step performed.
---
title: Project Breakdown
description:
  Learn about the anatomy of a Nargo project, including the purpose of the Prover TOML
  file, and how to prove and verify your program.
keywords:
  [Nargo, Nargo project, Prover.toml, proof verification, private asset transfer]
sidebar_position: 1
---

This section breaks down our hello world program from the previous section.

## Anatomy of a Nargo Project

Upon creating a new project with `nargo new` and building the in/output files with `nargo check`
commands, you would get a minimal Nargo project of the following structure:

    - src
    - Prover.toml
    - Nargo.toml

The source directory _src_ holds the source code for your Noir program. By default only a _main.nr_
file will be generated within it.

### Prover.toml

_Prover.toml_ is used for specifying the input values for executing and proving the program. You can specify `toml` files with different names by using the `--prover-name` or `-p` flags, see the [Prover](#provertoml) section below. Optionally you may specify expected output values for prove-time checking as well.

### Nargo.toml

_Nargo.toml_ contains the environmental options of your project. It contains a "package" section and a "dependencies" section.

Example Nargo.toml:

```toml
[package]
name = "noir_starter"
type = "bin"
authors = ["Alice"]
compiler_version = "0.9.0"
description = "Getting started with Noir"
entry = "circuit/main.nr"
license = "MIT"

[dependencies]
ecrecover = {tag = "v0.9.0", git = "https://github.com/colinnielsen/ecrecover-noir.git"}
```

Nargo.toml for a [workspace](../noir/modules_packages_crates/workspaces.md) will look a bit different. For example:

```toml
[workspace]
members = ["crates/a", "crates/b"]
default-member = "crates/a"
```

#### Package section

The package section defines a number of fields including:

- `name` (**required**) - the name of the package
- `type` (**required**) - can be "bin", "lib", or "contract" to specify whether its a binary, library or Aztec contract
- `authors` (optional) - authors of the project
- `compiler_version` - specifies the version of the compiler to use. This is enforced by the compiler and follow's [Rust's versioning](https://doc.rust-lang.org/cargo/reference/manifest.html#the-version-field), so a `compiler_version = 0.18.0` will enforce Nargo version 0.18.0, `compiler_version = ^0.18.0` will enforce anything above 0.18.0 but below 0.19.0, etc. For more information, see how [Rust handles these operators](https://docs.rs/semver/latest/semver/enum.Op.html)
- `description` (optional)
- `entry` (optional) - a relative filepath to use as the entry point into your package (overrides the default of `src/lib.nr` or `src/main.nr`)
- `backend` (optional)
- `license` (optional)
- `expression_width` (optional) - Sets the default backend expression width. This field will override the default backend expression width specified by the Noir compiler (currently set to width 4).

#### Dependencies section

This is where you will specify any dependencies for your project. See the [Dependencies page](../noir/modules_packages_crates/dependencies.md) for more info.

`./proofs/` and `./contract/` directories will not be immediately visible until you create a proof or
verifier contract respectively.

### main.nr

The _main.nr_ file contains a `main` method, this method is the entry point into your Noir program.

In our sample program, _main.nr_ looks like this:

```rust
fn main(x : Field, y : Field) {
    assert(x != y);
}
```

The parameters `x` and `y` can be seen as the API for the program and must be supplied by the prover. Since neither `x` nor `y` is marked as public, the verifier does not supply any inputs, when verifying the proof.

The prover supplies the values for `x` and `y` in the _Prover.toml_ file.

As for the program body, `assert` ensures that the condition to be satisfied (e.g. `x != y`) is constrained by the proof of the execution of said program (i.e. if the condition was not met, the verifier would reject the proof as an invalid proof).

### Prover.toml

The _Prover.toml_ file is a file which the prover uses to supply the inputs to the Noir program (both private and public).

In our hello world program the _Prover.toml_ file looks like this:

```toml
x = "1"
y = "2"
```

When the command `nargo execute` is executed, nargo will execute the Noir program using the inputs specified in `Prover.toml`, aborting if it finds that these do not satisfy the constraints defined by `main`. In this example, `x` and `y` must satisfy the inequality constraint `assert(x != y)`.

If an output name is specified such as `nargo execute foo`, the witness generated by this execution will be written to `./target/foo.gz`. This can then be used to generate a proof of the execution.

#### Arrays of Structs

The following code shows how to pass an array of structs to a Noir program to generate a proof.

```rust
// main.nr
struct Foo {
    bar: Field,
    baz: Field,
}

fn main(foos: [Foo; 3]) -> pub Field {
    foos[2].bar + foos[2].baz
}
```

Prover.toml:

```toml
[[foos]] # foos[0]
bar = 0
baz = 0

[[foos]] # foos[1]
bar = 0
baz = 0

[[foos]] # foos[2]
bar = 1
baz = 2
```

#### Custom toml files

You can specify a `toml` file with a different name to use for execution by using the `--prover-name` or `-p` flags.

This command looks for proof inputs in the default **Prover.toml** and generates the witness and saves it at `./target/foo.gz`:

```bash
nargo execute foo
```

This command looks for proof inputs in the custom **OtherProver.toml** and generates the witness and saves it at `./target/bar.gz`:

```bash
nargo execute -p OtherProver bar
```

Now that you understand the concepts, you'll probably want some editor feedback while you are writing more complex code.