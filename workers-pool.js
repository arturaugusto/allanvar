function WorkersPool(fun) {
    /**
     * fun: Function
     * */
    window.URL = window.URL || window.webkitURL

    const response = `
self.onmessage=function(e){
    const fun = ${fun.toString()};
    let res = fun(...e.data[0]);
    postMessage([res, e.data[1]]);
}`
    
    // based on https://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string
    let blob
    try {
        blob = new Blob([response], {type: 'application/javascript'})
    } catch (e) { // Backwards-compatibility
        window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder
        blob = new BlobBuilder()
        blob.append(response)
        blob = blob.getBlob()
    }

    let workers = Array(navigator.hardwareConcurrency || 4).fill().map((_, i) => i).map(() => {
        let worker = new Worker(URL.createObjectURL(blob))
        return worker
    })

    function run(args) {
        /**
         * args: Array[Array]
         * 
         * return: Promise
         * */
        return new Promise((resolve, reject) => {
            let resultsBuffer = args.map((_, i) => Object({
                done: false,
                result: undefined,
                resultIndex: i,
                working: false
            }))

            // set workers onmessage event
            workers.forEach((worker, i) => {
                worker.onmessage = function(e) {
                    let resultBuffer = resultsBuffer[e.data[1]]
                    Object.assign(resultBuffer, {
                        result: e.data[0],
                        done: true
                    })

                    let pendingResults = resultsBuffer.filter(item => !item.done)

                    if (!pendingResults.length) {
                        resolve(resultsBuffer.map(item => item.result))
                    } else {
                        let pendingWorkStart = pendingResults.filter(item => !item.working)
                        if (pendingWorkStart.length) {
                            //console.log(`re-spawn workers ${i}`)
                            let resultIndex = pendingWorkStart[0].resultIndex
                            pendingWorkStart[0].working = true
                            worker.postMessage([args[resultIndex], resultIndex])
                        }
                    }
                };
                worker.onerror = function(e) {
                    reject(e)
                }
            })

            // at start, use all avaliable workers
            workers.forEach((worker, i) => {
                if (args[i]) resultsBuffer[i].working = true
            })
            workers.forEach((worker, i) => {
                if (args[i]) worker.postMessage([args[i], i])
            })
        })
    }
    this.run = run
}
