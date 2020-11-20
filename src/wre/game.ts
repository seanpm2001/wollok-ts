import { interpret } from '..'
import { Evaluation, FALSE_ID, Natives, NULL_ID, RuntimeObject, TRUE_ID, VOID_ID } from '../interpreter'
import { Id } from '../model'
import natives from './wre.natives'

const newList = (evaluation: Evaluation, ...elements: Id[]) => evaluation.createInstance('wollok.lang.List', elements)

const returnValue = (evaluation: Evaluation, id: Id) => {
  evaluation.currentFrame()!.pushOperand(id)
}

export const returnVoid = (evaluation: Evaluation): void => {
  returnValue(evaluation, VOID_ID)
}

const get = (self: RuntimeObject, key: string) => (evaluation: Evaluation) => {
  returnValue(evaluation, self.get(key)?.id ?? NULL_ID)
}

const set = (self: RuntimeObject, key: string, value: RuntimeObject) => (evaluation: Evaluation) => {
  self.set(key, value.id)
  returnVoid(evaluation)
}

const property = (self: RuntimeObject, key: string, value?: RuntimeObject) => (evaluation: Evaluation) => {
  if (value)
    set(self, key, value)(evaluation)
  else
    get(self, key)(evaluation)
}

const redirectTo = (receiver: (evaluation: Evaluation) => string, voidMessage = true) => (message: string, ...params: string[]) =>
  (evaluation: Evaluation) => {
    const { sendMessage } = interpret(evaluation.environment, natives as Natives)
    sendMessage(message, receiver(evaluation), ...params)(evaluation)
    if (voidMessage) returnVoid(evaluation)
  }

const checkNotNull = (obj: RuntimeObject, name: string) => {
  if (obj.id === NULL_ID) throw new TypeError(name)
}

const mirror = (evaluation: Evaluation) => evaluation.environment.getNodeByFQN('wollok.gameMirror.gameMirror').id

const io = (evaluation: Evaluation) => evaluation.environment.getNodeByFQN('wollok.io.io').id

const wGame = (evaluation: Evaluation) => evaluation.instance(evaluation.environment.getNodeByFQN('wollok.game.game').id)

const getPosition = (id: Id) => (evaluation: Evaluation) => {
  const position = evaluation.instance(id).get('position')
  if (position) return position
  const { sendMessage } = interpret(evaluation.environment, natives as Natives)
  const currentFrame = evaluation.currentFrame()!
  sendMessage('position', id)(evaluation)
  return evaluation.instance(currentFrame.operandStack.pop()!)
}

const samePosition = (evaluation: Evaluation, position: RuntimeObject) => (id: Id) => {
  const visualPosition = getPosition(id)(evaluation)
  return position.get('x') === visualPosition.get('x')
    && position.get('y') === visualPosition.get('y')
}

const addToInnerCollection = (wObject: RuntimeObject, element: RuntimeObject, fieldName: string) => (evaluation: Evaluation) => {
  if (!wObject.get(fieldName)) {
    wObject.set(fieldName, newList(evaluation))
  }
  const fieldList: RuntimeObject = wObject.get(fieldName)!
  fieldList.assertIsCollection()
  if (fieldList.innerValue.includes(element.id)) throw new TypeError(element.moduleFQN)
  else fieldList.innerValue.push(element.id)
}

const addVisual = (gameObject: RuntimeObject, visual: RuntimeObject) => {
  return addToInnerCollection(gameObject, visual, 'visuals')
}

const addSound = (gameObject: RuntimeObject, sound: RuntimeObject) => {
  return addToInnerCollection(gameObject, sound, 'sounds')
}

const removeFromInnerCollection = (wObject: RuntimeObject, elementToRemove: RuntimeObject, fieldName: string) => {
  const fieldList = wObject.get(fieldName)
  if (fieldList) {
    const currentElements: RuntimeObject = fieldList
    currentElements.assertIsCollection()
    currentElements.innerValue = currentElements.innerValue.filter((id: Id) => id !== elementToRemove.id)
  }
}

const removeVisual = (gameObject: RuntimeObject, visual: RuntimeObject) => {
  removeFromInnerCollection(gameObject, visual, 'visuals')
}

const removeSound = (gameObject: RuntimeObject, sound: RuntimeObject) => {
  removeFromInnerCollection(gameObject, sound, 'sounds')
}

const newWString = (newString: string) => (evaluation: Evaluation) => {
  return evaluation.createInstance('wollok.lang.String', newString)
}

const toWBoolean = (booleanToConvert: boolean) => {
  return booleanToConvert ? TRUE_ID : FALSE_ID
}

const lookupMethod = (self: RuntimeObject, message: string) => (evaluation: Evaluation) =>
  evaluation.environment.getNodeByFQN<'Module'>(self.moduleFQN).lookupMethod(message, 0)

const game: Natives = {
  game: {
    addVisual: (self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      checkNotNull(visual, 'visual')
      const message = 'position' // TODO
      if (!lookupMethod(visual, message)(evaluation)) throw new TypeError(message)
      addVisual(self, visual)(evaluation)
      returnVoid(evaluation)
    },

    addVisualIn: (self: RuntimeObject, visual: RuntimeObject, position: RuntimeObject) => (evaluation: Evaluation): void => {
      checkNotNull(visual, 'visual')
      checkNotNull(position, 'position')
      visual.set('position', position.id)
      addVisual(self, visual)(evaluation)
      returnVoid(evaluation)
    },

    addVisualCharacter: (_self: RuntimeObject, visual: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('addVisualCharacter', visual.id),


    addVisualCharacterIn: (_self: RuntimeObject, visual: RuntimeObject, position: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('addVisualCharacterIn', visual.id, position.id),

    removeVisual: (self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      removeVisual(self, visual)
      returnVoid(evaluation)
    },

    whenKeyPressedDo: (_self: RuntimeObject, event: RuntimeObject, action: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(io)('addEventHandler', event.id, action.id),

    whenCollideDo: (_self: RuntimeObject, visual: RuntimeObject, action: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('whenCollideDo', visual.id, action.id),

    onCollideDo: (_self: RuntimeObject, visual: RuntimeObject, action: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('onCollideDo', visual.id, action.id),

    onTick: (_self: RuntimeObject, milliseconds: RuntimeObject, name: RuntimeObject, action: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('onTick', milliseconds.id, name.id, action.id),

    schedule: (_self: RuntimeObject, milliseconds: RuntimeObject, action: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(mirror)('schedule', milliseconds.id, action.id),

    removeTickEvent: (_self: RuntimeObject, event: RuntimeObject): (evaluation: Evaluation) => void =>
      redirectTo(io)('removeTimeHandler', event.id),

    allVisuals: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      const visuals = self.get('visuals')
      if (!visuals) return returnValue(evaluation, newList(evaluation))
      const currentVisuals: RuntimeObject = visuals
      currentVisuals.assertIsCollection()
      const result = newList(evaluation, ...currentVisuals.innerValue)
      returnValue(evaluation, result)
    },

    hasVisual: (self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      const visuals = self.get('visuals')
      if (!visuals) return returnValue(evaluation, FALSE_ID)
      const currentVisuals: RuntimeObject = visuals
      currentVisuals.assertIsCollection()
      returnValue(evaluation, toWBoolean(currentVisuals.innerValue.includes(visual.id)))
    },

    getObjectsIn: (self: RuntimeObject, position: RuntimeObject) => (evaluation: Evaluation): void => {
      const visuals = self.get('visuals')
      if (!visuals) return returnValue(evaluation, newList(evaluation))
      const currentVisuals: RuntimeObject = visuals
      currentVisuals.assertIsCollection()
      const result = newList(evaluation, ...currentVisuals.innerValue.filter(samePosition(evaluation, position)))
      returnValue(evaluation, result)
    },

    say: (_self: RuntimeObject, visual: RuntimeObject, message: RuntimeObject) => (evaluation: Evaluation): void => {
      const currentFrame = evaluation.currentFrame()!
      const { sendMessage } = interpret(evaluation.environment, natives as Natives)
      sendMessage('currentTime', io(evaluation))(evaluation)
      const wCurrentTime: RuntimeObject = evaluation.instance(currentFrame.operandStack.pop()!)
      wCurrentTime.assertIsNumber()
      const currentTime = wCurrentTime.innerValue
      const messageTimeId = evaluation.createInstance('wollok.lang.Number', currentTime + 2 * 1000)
      const messageTime = evaluation.instance(messageTimeId)
      set(visual, 'message', message)(evaluation)
      set(visual, 'messageTime', messageTime)(evaluation)
    },

    clear: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      const { sendMessage } = interpret(evaluation.environment, natives as Natives)
      sendMessage('clear', io(evaluation))(evaluation)
      self.set('visuals', newList(evaluation))
      returnVoid(evaluation)
    },

    colliders: (self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      checkNotNull(visual, 'visual')
      const visuals = self.get('visuals')
      if (!visuals) return returnValue(evaluation, newList(evaluation))
      const currentVisuals: RuntimeObject = visuals
      currentVisuals.assertIsCollection()
      const position = getPosition(visual.id)(evaluation)
      const result = newList(evaluation, ...currentVisuals.innerValue
        .filter(samePosition(evaluation, position))
        .filter(id => id !== visual.id)
      )
      returnValue(evaluation, result)
    },

    title: (self: RuntimeObject, title?: RuntimeObject): (evaluation: Evaluation) => void => property(self, 'title', title),

    width: (self: RuntimeObject, width?: RuntimeObject): (evaluation: Evaluation) => void => property(self, 'width', width),

    height: (self: RuntimeObject, height?: RuntimeObject): (evaluation: Evaluation) => void => property(self, 'height', height),

    ground: (self: RuntimeObject, ground: RuntimeObject): (evaluation: Evaluation) => void => set(self, 'ground', ground),

    boardGround: (self: RuntimeObject, boardGround: RuntimeObject): (evaluation: Evaluation) => void => set(self, 'boardGround', boardGround),

    doCellSize: (self: RuntimeObject, size: RuntimeObject): (evaluation: Evaluation) => void => set(self, 'cellSize', size),

    stop: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      self.set('running', FALSE_ID)
      returnVoid(evaluation)
    },

    hideAttributes: (_self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      visual.set('showAttributes', FALSE_ID)
      returnVoid(evaluation)
    },

    showAttributes: (_self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      visual.set('showAttributes', TRUE_ID)
      returnVoid(evaluation)
    },

    errorReporter: (self: RuntimeObject, visual: RuntimeObject) => (evaluation: Evaluation): void => {
      self.set('errorReporter', visual.id)
      returnVoid(evaluation)
    },

    doStart: (self: RuntimeObject, _isRepl: RuntimeObject) => (evaluation: Evaluation): void => {
      self.set('running', TRUE_ID)
      returnVoid(evaluation)
    },
  },

  Sound: {
    play: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      if (wGame(evaluation).get('running')?.id !== TRUE_ID)
        throw new Error('You cannot play a sound if game has not started')
      self.set('status', newWString('played')(evaluation))
      addSound(wGame(evaluation), self)(evaluation)
      returnVoid(evaluation)
    },

    played: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      returnValue(evaluation, toWBoolean(self.get('status')?.innerValue === 'played'))
    },

    stop: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      if (self.get('status')?.innerValue !== 'played')
        throw new Error('You cannot stop a sound that is not played')
      self.set('status', newWString('stopped')(evaluation))
      removeSound(wGame(evaluation), self)
      returnVoid(evaluation)
    },

    pause: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      if (self.get('status')?.innerValue !== 'played')
        throw new Error('You cannot pause a sound that is not played')
      self.set('status', newWString('paused')(evaluation))
      returnVoid(evaluation)
    },

    resume: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      if (self.get('status')?.innerValue !== 'paused')
        throw new Error('You cannot resume a sound that is not paused')
      self.set('status', newWString('played')(evaluation))
      returnVoid(evaluation)
    },

    paused: (self: RuntimeObject) => (evaluation: Evaluation): void => {
      returnValue(evaluation, toWBoolean(self.get('status')?.innerValue === 'paused'))
    },

    volume: (self: RuntimeObject, newVolume?: RuntimeObject) => (evaluation: Evaluation): void => {
      if (newVolume) {
        const volume: RuntimeObject = newVolume
        volume.assertIsNumber()
        if (volume.innerValue < 0 || volume.innerValue > 1)
          throw new RangeError('newVolume')
      }
      property(self, 'volume', newVolume)(evaluation)
    },

    shouldLoop: (self: RuntimeObject, looping?: RuntimeObject): (evaluation: Evaluation) => void => property(self, 'loop', looping),

  },
}

export default game