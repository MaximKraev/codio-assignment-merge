import { readFileSync, writeFileSync } from 'fs'
import { bookMerge, metadataMerge, assessmentMerge } from './lib/index.js'
import _ from 'lodash'
import { Console } from 'console'

const baseFile = process.argv[2]
const localFile = process.argv[3]
const remoteFile = process.argv[4]
const mergedFile = process.argv[5]


const base = JSON.parse(readFileSync(baseFile, {encoding: 'utf-8'}))
const local = JSON.parse(readFileSync(localFile, {encoding: 'utf-8'}))
const remote = JSON.parse(readFileSync(remoteFile, {encoding: 'utf-8'}))

function writeRes(res, file) {
  writeFileSync(file, JSON.stringify(res, undefined, ' '))
}


async function main() {
  let res

  if (_.includes(baseFile, 'book')) {
    console.log('book.json merge')
    res = await bookMerge(base, local, remote)
  } else if (_.includes(baseFile, 'metadata')) {
    res = metadataMerge(base, local, remote)
    console.log(res)
  } else if (_.includes(baseFile, 'assessments')) {
    res = await assessmentMerge(base, local, remote)
  }
  console.log('We done!!!')
  if (res !== null) {
    writeRes(res, mergedFile)
    process.exit(0)
  } else {
    process.exit(1)
  }
}

main()