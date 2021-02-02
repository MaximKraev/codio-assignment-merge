import _ from 'lodash'
import readline from 'readline'
import fs from 'fs'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function _ask(message, options, resolve) {
  rl.question(message, (answer) => {
    if (_.includes(options, answer)) {
      resolve(answer)
    } else {
      console.log('Sorry I do not understand you.')
      _ask(message, resolve)
    }
    rl.close()
  })
}

function ask(message, options) {
  const optionsQuoted = _.map(options, _ => `'${_}'`)
  const optionsString = _.join(optionsQuoted, ' or ')
  return new Promise(function(resolve) {
    _ask(`${message}\n Type ${optionsString}: `, options, resolve)
  })
}

function isEqualBookItem(item1, item2) { //ignoring children compares only main page
  return item1.title === item2.title
    && item1.type === item2.type
    && item1.pageId === item2.pageId
}

async function _traverseChildren(result, base, local, remote) {
  const localPageIds = _.map(local, 'id')
  const remotePageIds = _.map(remote, 'id')
  const basePageIds = _.map(base, 'id')

  for (const baseItem of base) {
    const { id } = baseItem
    if (!_.includes(localPageIds, id)) {
      console.log(`${base.title} was removed from remote`)
      continue
    }
    if (!_.includes(remotePageIds, id)) {
      console.log(`${base.title} was removed from local`)
      continue
    }
    let resultItem

    const localItem = _.find(local, {id})
    const remoteItem = _.find(remote, {id})

    if (!isEqualBookItem(localItem, remoteItem)) {
      console.log(`Conflict ${localItem.title}, trying to resolve`)
      if (isEqualBookItem(localItem, baseItem)) { //remote has changed
        console.log(`Resolved to remote`)
        resultItem = _.clone(remoteItem)
      } else if (isEqualBookItem(remoteItem, baseItem)) { // local has changed
        console.log(`Resolved to local`)
        resultItem = _.clone(localItem)
      } else { // both has changed
        const answer = await ask(
`Conflict sections:
Remote:
---------------------------
title: ${remoteItem.title}
type: ${remoteItem.type}
pageId: ${remoteItem.pageId}
===========================
Local:
---------------------------
title: ${localItem.title}
type: ${localItem.type}
pageId: ${localItem.pageId}
===========================`, ['local', 'remote'])
          resultItem = (answer === 'local') ? _.clone(localItem) : _.clone(remoteItem)
      }
    } else {
      console.log(`${localItem.title} has not changed`)
      resultItem = _.clone(localItem)
    }
    result.push(resultItem)
    if (!_.isUndefined(baseItem.children)) {
      console.log(`Processing children ${resultItem.title}`)
      resultItem.children = []
      // exists in remote and local go deep
      await _traverseChildren(resultItem.children, baseItem.children, localItem.children, remoteItem.children)
    }
  }

  // new from remote
  for (const remoteItem of remote) {
    if (!_.includes(basePageIds, remoteItem.id)) {
      console.log(`${remoteItem.title} new ${remoteItem.type}`)
      result.push(remoteItem)
    }
  }

  // new from local
  for (const localItem of local) {
    if (!_.includes(basePageIds, localItem.id)) {
      console.log(`${localItem.title} new ${localItem.type}`)
      result.push(localItem)
    }
  }
}

export async function bookMerge (base, local, remote) {
  const result = {}
  if (local.name !== remote.name) {
    const hasChangedLocal = base.name !== local.name
    const hasChangedRemote = base.name !== remote.name
    let answer
    if (hasChangedLocal && hasChangedRemote) {
      answer = await ask(`
Which Book name to use:
remote ${remote.name}
local ${local.name}`, ['remote', 'local'])
    } else if (hasChangedLocal) {
      answer = 'local'
    } else {
      answer = 'remote'
    }
    result.name = (answer === 'local')? local.name : remote.name
  } else {
    // name hasn't changed
    result.name = local.name
  }
  if (!_.isUndefined(base.children)) {
    result.children = []
    await _traverseChildren(result.children, base.children, local.children, remote.children)
  }
  return result
}

function getOrder(book, pages) {
  if (book.pageId) {
    pages.push(book.pageId)
  }
  if (book.children) {
    _.each(book.children, _ => getOrder(_, pages))
  }
}

async function mergeMetadataOptions(base, local, remote) {
  const baseItem = _.clone(base)
  baseItem.sections = []
  const localItem = _.clone(local)
  localItem.sections = []
  const remoteItem = _.clone(remote)
  remoteItem.sections = []

  let resultItem = baseItem
  if (_.isEqual(localItem, remoteItem)) {
    resultItem = localItem
  } else if (_.isEqual(localItem, baseItem)) { //remote has changed
    resultItem = remoteItem
  } else if (_.isEqual(remoteItem, baseItem)) { // local has changed
    resultItem = localItem
  } else { //manual conflict
    const answer = await ask(`
Remote:
-----------------
${JSON.stringify(remoteItem, undefined, ' ')}
=================
Local:
-----------------
${JSON.stringify(localItem, undefined, ' ')}
=================`, ['local', 'remote'])
    resultItem = (answer === 'local') ? localItem : remoteItem
  }
  return resultItem
}

export async function metadataMerge (base, local, remote) {
  const result = await mergeMetadataOptions(base, local, remote)
  // read book.json
  const booksContent = fs.readFileSync('.guides/book.json', {encoding:'utf-8'})
  let book
  try {
    book = JSON.parse(booksContent)
  } catch (_) {
    console.log('Cant parse book, was it merged?')
    throw _
  }


  const pages = []
  getOrder(book, pages)

  for(const id of pages) {
    console.log(id)
    const basePage = _.find(base.sections, {id})
    const localPage = _.find(local.sections, {id})
    const remotePage = _.find(remote.sections, {id})

    let item = basePage
    if (_.isEqual(localPage, remotePage)) { // nothing has changed
      item = localPage
    } else if (_.isEqual(localPage, basePage)) { // remote has chnaged
      item = remotePage
    } else if (_.isEqual(remotePage, basePage)) { // local has chnaged
      item = localPage
    } else {
      const answer = await ask(`
Remote:
-----------------
${JSON.stringify(remotePage, undefined, ' ')}
=================
Local:
-----------------
${JSON.stringify(localPage, undefined, ' ')}
=================`, ['local', 'remote'])
          item = (answer === 'local') ? localPage : remotePage
    }
    result.sections.push(item)
  }

  return result
}

export async function assessmentMerge(base, local, remote) {
  const result = []
  const remoteIds = _.map(remote, 'taskId')
  const localIds = _.map(local, 'taskId')
  const baseIds = _.map(base, 'taskId')

  for(const baseItem of base) {// process changed for old items
    const id = baseItem['taskId']
    const isInRemote = _.includes(remoteIds, id)
    const isInLocal = _.includes(localIds, id)

    if (isInLocal && isInRemote) {
      // both remote and local have it, lets compare
      const localItem = _.find(local, {'taskId': id})
      const remoteItem = _.find(remote, {'taskId': id})
      const isEqual = _.isEqual(localItem, remoteItem)
      let mergedItem = baseItem
      if (!isEqual) {
        const isLocalChanged = _.isEqual(localItem, baseItem)
        const isRemoteChanged = _.isEqual(remoteItem, baseItem)
        if (isLocalChanged && isRemoteChanged) {
          // ask who is the best
          const message = `
Select 'local' or 'remote' version
Local
---------------------------
${JSON.stringify(localitem, undefined, ' ')}
==============================
Remote
---------------------------
${JSON.stringify(remoteItem, undefined, ' ')}
==============================`
          const answer = await ask(message, ['local', 'remote'])
          mergedItem = (answer === 'local') ? localItem : remoteItem
        } else if (isLocalChanged) {
          mergedItem = localItem
        } else {
          mergedItem = remoteItem
        }
      }
      result.push(mergedItem)
    }
  }

  for(const remoteItem of remote) {// process changed for new items in remote
    const id = remoteItem['taskId']
    const isBaseItem = _.includes(baseIds, id)
    if (!isBaseItem) {
      result.push(remoteItem)
    }
  }

  for(const localItem of local) {// process changed for new items in local
    const id = localItem['taskId']
    const isBaseItem = _.includes(baseIds, id)
    if (!isBaseItem) {
      result.push(localItem)
    }
  }

  return result
}