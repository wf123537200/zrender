// 当前状态：

// （1）确定 animateshape dirty 的范围
//  (2) anmateTo 可选得，是否 stop 所有，默认 stop 所有
//  （3）lineview.js 里用了 animator 的地方，改用 cb.duration
// （5）解决问题：custom 中，opacity 继续动画，但是同级其他属性，（如 transition 相关） 继续
// 或者 shape 中，
// 或者 style 中 color 渐变

// source
// {
//     shape: {
//         points: [ [], [] ]
//     }
//     opacity: 50
// }

// path: ''
// name: shape
// sourcevalue: {points: [[]]}

// targetvalue: {points: [[]]}

// ---

// source: {points: [[]]}
// path: shape
// name ponits
// sourcevalue: [[]]
// targetvalue: [[]]





import Animator from '../animation/Animator';
import {
    createTrackClip,
    cloneFrameValue
} from '../animation/track';
import log from '../core/log';
import {
    isString,
    isFunction,
    isObject,
    isArrayLike,
    indexOf,
    assert
} from '../core/util';

/**
 * @alias modue:zrender/mixin/Animatable
 * @constructor
 */
var Animatable = function () {

    /**
     * @type {Array.<module:zrender/animation/Animator>}
     * @readOnly
     */
    this.animators = [];
};

Animatable.prototype = {

    constructor: Animatable,

    /**
     * @param {string} path The path to fetch value from object, like 'a.b.c'.
     * @param {boolean} [loop] Whether to loop animation.
     * @return {module:zrender/animation/Animator}
     * @example:
     *     el.animate('style', false)
     *         .when(1000, {x: 10} )
     *         .done(function(){ // Animation done })
     *         .start()
     */
    animate: function (path, loop) {
        var target;
        var animatingShape = false;
        var el = this;
        var zr = this.__zr;
        if (path) {
            var pathSplitted = path.split('.');
            var prop = el;
            // If animating shape
            animatingShape = pathSplitted[0] === 'shape';
            for (var i = 0, l = pathSplitted.length; i < l; i++) {
                if (!prop) {
                    continue;
                }
                prop = prop[pathSplitted[i]];
            }
            if (prop) {
                target = prop;
            }
        }
        else {
            target = el;
        }

        if (!target) {
            log(
                'Property "'
                + path
                + '" is not existed in element '
                + el.id
            );
            return;
        }

        var animators = el.animators;

        var animator = new Animator(target, loop);

        animator.during(function (target) {
            el.dirty(animatingShape);
        })
        .done(function () {
            // FIXME Animator will not be removed if use `Animator#stop` to stop animation
            animators.splice(indexOf(animators, animator), 1);
        });

        animators.push(animator);

        // If animate after added to the zrender
        if (zr) {
            zr.animation.addAnimator(animator);
        }

        return animator;
    },

    /**
     * @param {boolean} forwardToLast If move to last frame before stop
     */
    stopAnimation: function (forwardToLast) {
        var animators = this.animators;
        var len = animators.length;
        for (var i = 0; i < len; i++) {
            animators[i].stop(forwardToLast);
        }
        animators.length = 0;

        liteAnimatorClear(this, this.__zr);

        return this;
    },

    /**
     * Caution: this method will stop previous animation.
     * So do not use this method to one element twice before
     * animation starts, unless you know what you are doing.
     * @param {Object} target This object must not be shared outside.
     * @param {number} [time=500] Time in ms
     * @param {string} [easing='linear']
     * @param {number} [delay=0]
     * @param {Function|Object} [callback] During or done callback.
     *        `Function`: done callback.
     *        `Object`: {during: function() {}, done: function() {}}.
     *        If the animation is terminated before it finished, done callback
     *        will not be called. If a prop is animating but called to start
     *        another animate, the previous done callback will not be called.
     * @param {boolean} [forceAnimate] Prevent stop animation and callback
     *        immediently when target values are the same as current values.
     *
     * @example
     *  // Animate position
     *  el.animateTo({
     *      position: [10, 10]
     *  }, function () { // done })
     *
     *  // Animate shape, style and position in 100ms, delayed 100ms, with cubicOut easing
     *  el.animateTo({
     *      shape: {
     *          width: 500
     *      },
     *      style: {
     *          fill: 'red'
     *      }
     *      position: [10, 10]
     *  }, 100, 100, 'cubicOut', function () { // done })
     */
    // TODO Return animation key
    animateTo: function (target, time, delay, easing, callback, forceAnimate) {
        startTransition(this, target, time, delay, easing, callback, forceAnimate);
    },

    /**
     * Animate from the target state to current state.
     * The params and the return value are the same as `this.animateTo`.
     */
    animateFrom: function (target, time, delay, easing, callback, forceAnimate) {
        startTransition(this, target, time, delay, easing, callback, forceAnimate, true);
    }
};

Animatable.addSelfToZr = function (el, zr) {
    var animators = this.animators;
    if (animators) {
        for (var i = 0; i < animators.length; i++) {
            zr.animation.addAnimator(animators[i]);
        }
    }
    liteAnimatorAddRemoveToAnimation(el, zr, 'add');
};

Animatable.removeSelfFromZr = function (el, zr) {
    var animators = this.animators;
    if (animators) {
        for (var i = 0; i < animators.length; i++) {
            zr.animation.removeAnimator(animators[i]);
        }
    }
    liteAnimatorAddRemoveToAnimation(el, zr, 'remove');
};

function startTransition(el, target, time, delay, easing, callback, forceAnimate, reverse) {
    // startTransition(el, target, time, easing, callback);
    if (isString(delay)) {
        callback = easing;
        easing = delay;
        delay = null;
    }
    // startTransition(el, target, time, delay, callback);
    else if (isFunction(easing) || isObject(easing)) {
        callback = easing;
        easing = null;
    }
    // startTransition(el, target, time, callback);
    else if (isFunction(delay) || isObject(easing)) {
        callback = delay;
        easing = delay = null;
    }
    // startTransition(el, target, callback)
    else if (isFunction(time) || isObject(easing)) {
        callback = time;
        time = delay = easing = null;
    }
    // startTransition(el, target)

    easing == null && (easing = 'linear');
    time == null && (time = 500);

    var zr = el && el.__zr;
    var animation = zr && zr.animation;

    if (!animation || time <= 0) {
        return;
    }

    var liteAnimator = new LiteAnimator(el, callback);

    transitionShallow(
        el, '', el, target,
        time, easing, delay, forceAnimate,
        liteAnimator, reverse
    );
}

/**
 * If `reverse` is `true`, animate from the `target` to current state.
 */
function transitionShallow(
    animatable, path, source, target,
    time, easing, delay, forceAnimate,
    liteAnimator, reverse
) {
    for (var name in target) {
        if (!target.hasOwnProperty(name)) {
            continue;
        }
        var targetValue = target[name];
        var sourceValue = source[name];

        if (sourceValue != null && isObject(targetValue) && !isArrayLike(targetValue)) {
            // only support dill down to shape/style level. see `setAttrByPath`.
            assert(path === '', 'Animation target must not be more than two level.');

            transitionShallow(
                animatable, name, sourceValue, targetValue,
                time, easing, delay, forceAnimate,
                liteAnimator, reverse
            );
        }
        else if (sourceValue != null) {
            // Whether values are the same will be checked in `forceAnimate`.
            // If invalid value do not animate.
            if (targetValue == null) {
                continue;
            }
            // Make sure `sourceValue` be exclusive in clip, but `targetValue`
            // is required to be new, do not need to clone.
            sourceValue = cloneFrameValue(sourceValue);
            var fromValue;
            var toValue;

            if (reverse) {
                toValue = sourceValue;
                fromValue = targetValue;
                setAttrByPath(animatable, path, name, fromValue);
            }
            else {
                toValue = targetValue;
                fromValue = sourceValue;
            }

            liteAnimator.add(path + '.' + name, createTrackClip(
                source,
                name,
                [
                    {time: 0, value: fromValue},
                    {time: time, value: toValue}
                ],
                easing,
                delay,
                false,
                forceAnimate
            ));

            liteAnimator.setDirtyArg(!path && name === 'shape');
        }
        else if (targetValue != null && !reverse) {
            setAttrByPath(animatable, path, name, targetValue);
        }
    }
}

function setAttrByPath(el, path, name, value) {
    // Attr directly if not has property
    // FIXME, if some property not needed for element ?
    if (!path) { // path is ''
        el.attr(name, value);
    }
    else {
        // Only support set shape or style
        var obj = {};
        obj[name] = value;
        el.attr(path, obj);
    }
}


/**
 * Customized animator for `el.animateTo` (it is mostly used).
 * Support snatch some clip from other animator. And simplify some
 * operations other than `zrender/animation/Animator`. (e.g, Clip
 * management changed, and some API do not need to be implemeneted
 * in this case).
 * The reference of the liteAnimator instance are only kept by clip,
 * but not elements.
 *
 * FIXME: Needed to merge the functionality to
 * `zrender/animation/Animator`? But it is worried that merge the
 * logic might bring mess.
 *
 * [Caveat]:
 * The input clip should not be added to zr.animation outside.
 * Because the order of `liteAnimator.add(clip)` must be ensured
 * the same as the order of `zr.animation.addClip(clip)`, since
 * the last clip is used to tirgger event.
 *
 *
 * @class LiteAnimator
 * @param {module:zrender/Element} el
 * @param {Obejct} callback
 * @param {Function} [callback.done]
 * @param {Function} [callback.during]
 */
function LiteAnimator(el, callback) {
    this._el = el;
    this._done = callback && callback.done;
    this._during = callback && callback.during;
    this._willDirtyPath = false;

    // Record clip linked list to find another last clip when snatched.
    // Do not need to travel and query, only add/remove.
    this._lastClip;
}

LiteAnimator.prototype = {

    constructor: LiteAnimator,

    setDirtyArg: function (animatingShape) {
        // If any clip is animating shape, dirty shape.
        this._willDirtyPath = !!(this._willDirtyPath || animatingShape);
    },

    add: function (clipKey, clip) {
        // clip can be null/undefined, in which case only stop
        // the previous animation on the clipKey.
        assert(clipKey != null);

        var el = this._el;
        // Theoretically el migth be added to different zr,
        // and thus have different animation.
        var zr = el.__zr;
        var animation = zr && zr.animation;

        // existing clip always be removed whatever clip exists.
        liteAnimatorSnatch(el, animation, clipKey);

        if (!clip) {
            return;
        }

        // Add to linked list and shift its listener to the new last.
        var oldLastClip = this._lastClip;
        this._lastClip = clip;
        if (oldLastClip) {
            oldLastClip.onpostframe = null;
            clip.__lAniClipPrev = oldLastClip;
            oldLastClip.__lAniClipNext = clip;
        }
        clip.onpostframe = liteAnimatorOnFrame;

        // Initialize clip.
        clip.__lAnimator = this;
        clip.__lAniClipKey = clipKey;
        clip.ondestory = liteAnimatorOnClipDestroy;
        liteAnimatorAddClipToEl(el, clipKey, clip);
        animation && animation.addClip(clip);
    }
};

// `this` is the clip (the last clip of its animator).
function liteAnimatorOnFrame() {
    var liteAnimator = this.__lAnimator;
    liteAnimator._el.dirty(liteAnimator._willDirtyPath);
    liteAnimator._during && liteAnimator._during();
}

// `this` is the clip.
function liteAnimatorOnClipDestroy() {
    var liteAnimator = this.__lAnimator;
    this.__lAnimator = null;
    liteAnimatorRemoveClipFromEl(liteAnimator._el, this.__lAniClipKey);
    liteAnimator._done && liteAnimator._done();
    // clip will be auto removed by `Animation` after destroyed.
}

// Notice: there might be some running clips that is not
// relative to props of this `animateTo` or `animateFrom` calling.
// Keep them running in this case.
// The reason:
// We should not stop all of the existing clips and keep the props in
// the current state, otherwise the previous props changings can not be
// fully completed. And we should not stop clips and forward them to the
// last frame either, otherwise the animation will not be smooth.
// For example, consider the case, the initial animation is on
// `opacity`, and then other animations on `position` are started. The
// `opacity` animation should be continued.
// When the previous animation is terminated, do not call done.
// (This rule is appropriate in most cases).
function liteAnimatorSnatch(el, animation, clipKey) {
    var existingClip = liteAnimatorGetClipFromEl(el, clipKey);

    if (!existingClip) {
        return;
    }

    var existingAnimator = existingClip.__lAnimator;

    // Dispose clip.
    liteAnimatorRemoveClipFromEl(el, clipKey);
    animation && animation.removeClip(existingClip);
    existingClip.__lAnimator = null;

    // Remove from linked list and shift listener to the new last.
    existingClip.onpostframe = null;
    var prev = existingClip.__lAniClipPrev;
    var next = existingClip.__lAniClipNext;
    prev && (prev.__lAniClipNext = next);
    next && (next.__lAniClipPrev = prev);

    if (existingAnimator._lastClip === existingClip) {
        existingAnimator._lastClip = prev;
        prev && (prev.onpostframe = liteAnimatorOnFrame);
    }
}

function liteAnimatorAddClipToEl(el, clipKey, clip) {
    // Do not create map until necessary.
    (
        el.__lAniClipMap || (el.__lAniClipMap = {})
    )[clipKey] = clip;

    el.__lAniClipCount = (el.__lAniClipCount || 0) + 1;
    el.__lAniClipCount === 1 && (el.__lAniFirstClip = clip);
}

function liteAnimatorRemoveClipFromEl(el, clipKey) {
    var clipMap = el.__lAniClipMap;
    if (clipMap && clipMap[clipKey]) {
        clipMap[clipKey] = null;
        !(--el.__lAniClipCount) && (el.__lAniFirstClip = null);
    }
}

function liteAnimatorGetClipFromEl(el, clipKey) {
    var clipMap = el.__lAniClipMap;
    return clipMap && clipMap[clipKey];
}

function liteAnimatorAddRemoveToAnimation(el, zr, addOrRemove) {
    var count = el.__lAniClipCount;
    var animation = zr && zr.animation;

    if (!count || !animation) {
        return;
    }

    // Simple optimize for travel that in most cases only one
    // clip exists for each el when repeatly call `el.remvoeAll()`.
    // and add back to zr after recreate it or updated something.
    if (count === 1) {
        animation[addOrRemove](el.__lAniFirstClip);
        return;
    }

    var clipMap = el.__lAniClipMap;
    if (clipMap) {
        for (var clipKey in clipMap) {
            if (clipMap.hasOwnProperty(clipKey)) {
                var clip = clipMap[clipKey];
                clip && animation[addOrRemove](clip);
            }
        }
    }
}

function liteAnimatorClear(el, zr) {
    liteAnimatorAddRemoveToAnimation(el, zr, 'remove');
    el.__lAniFirstClip = el.__lAniClipMap = el.__lAniClipCount = null;
}


export default Animatable;
