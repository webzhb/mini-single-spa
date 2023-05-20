### 参考地址：https://github.com/YataoZhang/my-single-spa/issues/4

一、初始化工程
1、初始化工程目录

cd ~ && mkdir my-single-spa && cd "$\_"
2、初始化 npm 环境

# 初始化 package.json 文件

npm init -y

# 安装 dev 依赖

npm install @babel/core @babel/plugin-syntax-dynamic-import @babel/preset-env rollup rollup-plugin-babel rollup-plugin-commonjs rollup-plugin-node-resolve rollup-plugin-serve -D
模块名称 说明
@babel/core babel 编译器的核心库，负责所有 babel 预设和插件的加载及执行
@babel/plugin-syntax-dynamic-import 支持使用 import()进行动态导入，当前在 Stage 4: finished 的阶段
@babel/preset-env 预设：为方便开发提供的常用的插件集合
rollup javascript 打包工具，在打包方面比 webpack 更加的纯粹
rollup-plugin-babel 让 rollup 支持 babel，开发者可以使用高级 js 语法
rollup-plugin-commonjs 将 commonjs 模块转换为 ES6
rollup-plugin-node-resolve 让 rollup 支持 nodejs 的模块解析机制
rollup-plugin-serve 支持 dev serve，方便调试和开发
3、配置 babel 和 rollup

# 创建 babel.config.js

touch babel.config.js
然后添加内容：

module.export = function (api) {
// 缓存 babel 的配置
api.cache(true); // 等同于 api.cache.forever()
return {
presets: [
['@babel/preset-env', {module: false}]
],
plugins: ['@babel/plugin-syntax-dynamic-import']
};
};

# 创建 rollup.config.js

touch rollup.config.js
然后添加以下内容：

import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import commonjs from 'rollup-plugin-commonjs';
import serve from 'rollup-plugin-serve';

export default {
input: './src/my-single-spa.js',
output: {
file: './lib/umd/my-single-spa.js',
format: 'umd',
name: 'mySingleSpa',
sourcemap: true
},
plugins: [
resolve(),
commonjs(),
babel({exclude: 'node_modules/**'}),
// 见下方的 package.json 文件 script 字段中的 serve 命令
// 目的是只有执行 serve 命令时才启动这个插件
process.env.SERVE ? serve({
open: true,
contentBase: '',
openPage: '/toutrial/index.html',
host: 'localhost',
port: '10001'
}) : null
]
}
4、在 package.json 中添加 script 和 browserslist 字段

{
"script": {
"build:dev": "rollup -c",
"serve": "SERVE=true rollup -c -w"
},
"browserslist": [
"ie >=11",
"last 4 Safari major versions",
"last 10 Chrome major versions",
"last 10 Firefox major versions",
"last 4 Edge major versions"
]
}
4、添加项目文件夹

mkdir -p src/applications src/lifecycles src/navigation src/services toutrial && touch src/my-single-spa.js && touch toutrial/index.html
到目前为止，整个项目的文件夹结构应该是：

.
├── babel.config.js
├── package-lock.json
├── package.json
├── rollup.config.js
├── node_modules
├── toutrial
| └── index.html
└── src
├── applications
├── lifecycles
├── my-single-spa.js
├── navigation
└── services
到此，项目就已经初始化完毕了，接下来开始核心的内容，微前端框架的编写。

二、app 相关概念
1、app 要求
微前端的核心为 app，微前端的场景主要是：将应用拆分为多个 app 加载，或将多个不同的应用当成 app 组合在一起加载。

为了更好的约束 app 和行为，要求每个 app 必须向外 export 完整的生命周期函数，使微前端框架可以更好地跟踪和控制它们。

// app1
export default {
// app 启动
bootstrap: [() => Promise.resolve()],
// app 挂载
mount: [() => Promise.resolve()],
// app 卸载
unmount: [() => Promise.resolve()],
// service 更新，只有 service 才可用
update: [() => Promise.resolve()]
}
生命周期函数共有 4 个：bootstrap、mount、unmount、update。
生命周期可以传入 返回 Promise 的函数也可以传入 返回 Promise 函数的数组。

2、app 状态
为了更好的管理 app，特地给 app 增加了状态，每个 app 共存在 11 个状态，其中每个状态的流转图如下：

image

状态说明（app 和 service 在下表统称为 app）：

状态 说明 下一个状态
NOT_LOADED app 还未加载，默认状态 LOAD_SOURCE_CODE
LOAD_SOURCE_CODE 加载 app 模块中 NOT_BOOTSTRAPPED、SKIP_BECAUSE_BROKEN、LOAD_ERROR
NOT_BOOTSTRAPPED app 模块加载完成，但是还未启动（未执行 app 的 bootstrap 生命周期函数） BOOTSTRAPPING
BOOTSTRAPPING 执行 app 的 bootstrap 生命周期函数中（只执行一次） SKIP_BECAUSE_BROKEN
NOT_MOUNTED app 的 bootstrap 或 unmount 生命周期函数执行成功，等待执行 mount 生命周期函数（可多次执行） MOUNTING
MOUNTING 执行 app 的 mount 生命周期函数中 SKIP_BECAUSE_BROKEN
MOUNTED app 的 mount 或 update(service 独有)生命周期函数执行成功，意味着此 app 已挂载成功，可执行 Vue 的$mount()或ReactDOM的render()	UNMOUNTING、UPDATEING
UNMOUNTING	app的unmount生命周期函数执行中，意味着此app正在卸载中，可执行Vue的$destory()或 ReactDOM 的 unmountComponentAtNode() SKIP_BECAUSE_BROKEN、NOT_MOUNTED
UPDATEING service 更新中，只有 service 才会有此状态，app 则没有 SKIP_BECAUSE_BROKEN、MOUNTED
SKIP_BECAUSE_BROKEN app 变更状态时遇见错误，如果 app 的状态变为了 SKIP_BECAUSE_BROKEN，那么 app 就会 blocking，不会往下个状态变更 无
LOAD_ERROR 加载错误，意味着 app 将无法被使用 无
load、mount、unmount 条件
判断需要被加载(load)的 App：

image

判断需要被挂载(mount)的 App：

image

判断需要被卸载(unmount)的 App：

image

3、app 生命周期函数和超时的处理
app 的生命周期函数何以传入数组或函数，但是它们都必须返回一个 Promise，为了方便处理，所以我们会判断：如果传入的不是 Array，就会用数组将传入的函数包裹起来。

export function smellLikeAPromise(promise) {
if (promise instanceof Promise) {
return true;
}
return typeof promise === 'object' && promise.then === 'function' && promise.catch === 'function';
}

export function flattenLifecyclesArray(lifecycles, description) {
if (Array.isArray(lifecycles)) {
lifecycles = [lifecycles]
}
if (lifecycles.length === 0) {
lifecycles = [() => Promise.resolve()];
}
// 处理 lifecycles
return props => new Promise((resolve, reject) => {
waitForPromise(0);

        function waitForPromise(index) {
            let fn = lifecycles[index](props);
            if (!smellLikeAPromise(fn)) {
                reject(`${description} at index ${index} did not return a promise`);
                return;
            }
            fn.then(() => {
                if (index >= lifecycles.length - 1) {
                    resolve();
                } else {
                    waitForPromise(++index);
                }
            }).catch(reject);
        }
    });

}

// 示例
app.bootstrap = [
() => Promise.resolve(),
() => Promise.resolve(),
() => Promise.resolve()
];
app.bootstrap = flattenLifecyclesArray(app.bootstrap);
具体的流程如下图所示：

image

思考：如果用 reduce 的话怎么写？有什么需要注意的问题么？

为了 app 的可用性，我们还讲给每个 app 的生命周期函数增加超时的处理。

// flattenedLifecyclesPromise 为经过上一步 flatten 处理过的生命周期函数
export function reasonableTime(flattenedLifecyclesPromise, description, timeout) {
return new Promise((resolve, reject) => {
let finished = false;
flattenedLifecyclesPromise.then((data) => {
finished = true;
resolve(data)
}).catch(e => {
finished = true;
reject(e);
});

        setTimeout(() => {
            if (finished) {
                return;
            }
            let error = `${description} did not resolve or reject for ${timeout.milliseconds} milliseconds`;
            if (timeout.rejectWhenTimeout) {
                reject(new Error(error));
            } else {
                console.log(`${error} but still waiting for fulfilled or unfulfilled`);
            }
        }, timeout.milliseconds);
    });

}

// 示例
reasonableTime(app.bootstrap(props), 'app bootstraping', {rejectWhenTimeout: false, milliseconds: 3000})
.then(() => {
console.log('app 启动成功了');
console.log(app.status === 'NOT_MOUNTED'); // => true
})
.catch(e => {
console.error(e);
console.log('app 启动失败');
console.log(app.status === 'SKIP_BECAUSE_BROKEN'); // => true
});
三、路由拦截
微前端中 app 分为两种：一种是根据 Location 进行变化的，称之为 app。另一种是纯功能(Feature)级别的，称之为 service。

如果要实现随 Location 的变化动态进行 mount 和 unmount 那些符合条件的 app，我们就需要对浏览器的 Location 相关操作做统一的拦截。另外，为了在使用 Vue、React 等视图框架时降低冲突，我们需要保证微前端必须是第一个处理 Location 的相关事件，然后才是 Vue 或 React 等框架的 Router 处理。

为什么 Location 改变时，微前端框架一定要第一个执行相关操作哪？如何保证"第一个"？

因为微前端框架要根据 Location 来对 app 进行 mount 或 unmount 操作。然后 app 内部使用的 Vue 或 React 才开始真正进行后续工作，这样可以最大程度减少 app 内部 Vue 或 React 的无用（冗余）操作。

对原生的 Location 相关事件进行拦截（hijack），统一由微前端框架进行控制，这样就可以保证总是第一个执行。

const HIJACK_EVENTS_NAME = /^(hashchange|popstate)$/i;
const EVENTS_POOL = {
hashchange: [],
popstate: []
};

function reroute() {
// invoke 主要用来 load、mount、unmout 满足条件的 app
// 具体条件请看文章上方 app 状态小节中的"load、mount、unmount 条件"
invoke([], arguments)
}

window.addEventListener('hashchange', reroute);
window.addEventListener('popstate', reroute);

const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;
window.addEventListener = function (eventName, handler) {
if (eventName && HIJACK_EVENTS_NAME.test(eventName) && typeof handler === 'function') {
EVENTS_POOL[eventName].indexOf(handler) === -1 && EVENTS_POOL[eventName].push(handler);
}
return originalAddEventListener.apply(this, arguments);
};
window.removeEventListener = function (eventName, handler) {
if (eventName && HIJACK_EVENTS_NAME.test(eventName)) {
let eventsList = EVENTS_POOL[eventName];
eventsList.indexOf(handler) > -1 && (EVENTS_POOL[eventName] = eventsList.filter(fn => fn !== handler));
}
return originalRemoveEventListener.apply(this, arguments);
};

function mockPopStateEvent(state) {
return new PopStateEvent('popstate', {state});
}

// 拦截 history 的方法，因为 pushState 和 replaceState 方法并不会触发 onpopstate 事件，所以我们即便在 onpopstate 时执行了 reroute 方法，也要在这里执行下 reroute 方法。
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;
window.history.pushState = function (state, title, url) {
let result = originalPushState.apply(this, arguments);
reroute(mockPopStateEvent(state));
return result;
};
window.history.replaceState = function (state, title, url) {
let result = originalReplaceState.apply(this, arguments);
reroute(mockPopStateEvent(state));
return result;
};

// 再执行完 load、mount、unmout 操作后，执行此函数，就可以保证微前端的逻辑总是第一个执行。然后 App 中的 Vue 或 React 相关 Router 就可以收到 Location 的事件了。
export function callCapturedEvents(eventArgs) {
if (!eventArgs) {
return;
}
if (!Array.isArray(eventArgs)) {
eventArgs = [eventArgs];
}
let name = eventArgs[0].type;
if (!HIJACK_EVENTS_NAME.test(name)) {
return;
}
EVENTS_POOL[name].forEach(handler => handler.apply(window, eventArgs));
}
四、执行流程（核心）
整个微前端框架的执行顺序和 js 事件循环相似，大体执行流程如下：

image

触发时机
整个系统的触发时机分为两类：

浏览器触发：浏览器 Location 发生改变，拦截 onhashchange 和 onpopstate 事件，并 mock 浏览器 history 的 pushState()和 replaceState()方法。
手动触发：手动调用框架的 registerApplication()或 start()方法。
修改队列(changesQueue)
每通过触发时机进行一次触发操作，都会被存放到 changesQueue 队列中，它就像事件循环的事件队列一样，静静地等待被处理。如果 changesQueue 为空，则停止循环直至下一次触发时机到来。

和 js 事件循环队列不同的是，changesQueue 是当前循环内的所有修改(changes)会绑成一批（batch）同时执行，而 js 事件循环是一个一个地执行。

"事件"循环
在每一次循环的开始阶段，会先判断整个微前端的框架是否已经启动。

未启动：
根据规则（见上文的『判断需要被加载(load)的 App』）加载需要被加载的 app，加载完成之后调用内部的 finish 方法。

已启动：
根据规则获取当前因为不满足条件而需要被卸载(unmount)的 app、需要被加载(load)的 app 以及需要被挂载(mount)的 app，将 load 和 mount 的 app 先合并在一起进行去重，等 unmout 完成之后再统一进行 mount。然后再等到 mount 执行完成之后就会调用内部的 finish 方法。

可以通过调用 mySingleSpa.start()来启动微前端框架。

通过上文我们可以发现不管是当前的微前端框架的状态是未启动或已启动，最终都会调用内部的 finish 方法。其实，finish 方法的内部很简单，判断当前的 changesQueue 是否为空，如果不为空则重新启动下一次循环，如果为空则终止终止循环，退出整个流程。

function finish() {
// 获取成功 mount 的 app
let resolveValue = getMountedApps();

    // pendings是上一次循环进行时存储的一批changesQueue的别名
    // 其实就是下方调用invoke方法的backup变量
    if (pendings) {
        pendings.forEach(item => item.success(resolveValue));
    }
    // 标记循环已结束
    loadAppsUnderway = false;
    // 发现changesQueue的长度不为0
    if (pendingPromises.length) {
        const backup = pendingPromises;
        pendingPromises = [];
        // 将『修改队列』传入invoke方法，并开启下一次循环
        return invoke(backup);
    }

    // changesQueue为空，终止循环，返回已mount的app
    return resolveValue;

}
location 事件
另外在每次循环终止时都会将已拦截的 location 事件进行触发，这样就可以保证上文说的微前端框架的 location 触发时机总是首先被执行，而 Vue 或 React 的 Router 总是在后面执行。

最后
微前端框架仓库地址：https://github.com/YataoZhang/my-single-spa
