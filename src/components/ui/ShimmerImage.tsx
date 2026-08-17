"use client";

import Image, { type ImageProps } from "next/image";
import { useCallback, useState } from "react";

type LoadState = "loading" | "loaded" | "error";

/**
 * Shared load tracking for both wrappers below.
 *
 * Two things have to be handled, and neither wants an effect:
 *
 *   - A **cached image** can already be decoded by the time React attaches its
 *     handlers, so `onLoad` never fires and the shimmer would sit on top of a
 *     perfectly good picture forever. The ref callback runs at commit, which is
 *     the first moment the element exists, so `complete` is checked there.
 *     `naturalWidth` is what separates "done" from "done, but broken".
 *   - A **changed src** has to drop back to loading. That is done by comparing
 *     against the last src during render — React's documented way to adjust
 *     state on a prop change, and it repaints without the extra frame an effect
 *     would cost.
 */
// `src` is only ever compared for identity here, so it stays deliberately
// untyped — next/image and a plain <img> disagree about what a src may be.
function useImageLoadState(src: unknown) {
  const [state, setState] = useState<LoadState>("loading");
  const [seenSrc, setSeenSrc] = useState(src);

  if (src !== seenSrc) {
    setSeenSrc(src);
    setState("loading");
  }

  const attach = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) {
      setState(img.naturalWidth > 0 ? "loaded" : "error");
    }
  }, []);

  const onLoad = useCallback(() => setState("loaded"), []);
  const onError = useCallback(() => setState("error"), []);

  return { state, attach, onLoad, onError };
}

interface Props extends Omit<ImageProps, "onLoad" | "onError"> {
  /**
   * Extra classes for the wrapper that holds the placeholder. Only used in the
   * fixed-size form — with `fill`, the caller's own positioned parent is the
   * wrapper and there is nothing to style.
   */
  wrapperClassName?: string;
  /** Shown instead of the shimmer if the image fails. Defaults to a flat grey. */
  fallback?: React.ReactNode;
}

/**
 * A next/image that shimmers until the picture actually arrives, then fades it
 * in.
 *
 * Menu photography is served straight from Blob storage `unoptimized`, at
 * whatever size it was uploaded — so on a phone connection there is a real gap
 * between layout and picture. Left alone that gap renders as a white hole that
 * pops, which reads as breakage rather than loading.
 */
export default function ShimmerImage({
  wrapperClassName = "",
  fallback,
  className = "",
  ...props
}: Props) {
  const { state, attach, onLoad, onError } = useImageLoadState(props.src);

  const placeholder =
    state === "error" ? (
      (fallback ?? <div className="absolute inset-0 bg-gray-100" />)
    ) : (
      <div className="animate-shimmer absolute inset-0" aria-hidden="true" />
    );

  const image = (
    // ImageProps makes `alt` required at the type level; the rule just can't
    // see it arriving through the spread.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      {...props}
      ref={attach}
      className={`${className} transition-opacity duration-300 ${
        state === "loaded" ? "opacity-100" : "opacity-0"
      }`}
      onLoad={onLoad}
      onError={onError}
    />
  );

  // With `fill`, the caller already owns a positioned parent for the image to
  // fill — the placeholder can share it, and adding a wrapper here would break
  // the sizing the caller set up.
  if (props.fill) {
    return (
      <>
        {state !== "loaded" && placeholder}
        {image}
      </>
    );
  }

  // Fixed-size form: nothing is guaranteed to be positioned, so bring our own
  // box. Sized by the image itself, which keeps it out of the layout's way.
  return (
    <span className={`relative inline-block ${wrapperClassName}`}>
      {state !== "loaded" && placeholder}
      {image}
    </span>
  );
}

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Required: these are dish photos, and each one needs a name. */
  alt: string;
  /** Swapped in if the real photo fails, so a card never shows a broken frame. */
  fallbackSrc?: string;
}

/**
 * The same treatment for a plain `<img>`.
 *
 * The menu cards deliberately don't go through next/image — the photos are
 * already sized in Blob storage and every one of them would be `unoptimized`,
 * so the wrapper would buy nothing. This keeps those call sites a one-word
 * change instead of a layout rewrite.
 *
 * Renders a bare overlay + image, so **the parent must be positioned**. Every
 * current caller already is, because each has a veg marker or badge absolutely
 * placed on the photo.
 */
export function ShimmerImg({
  className = "",
  fallbackSrc = "/food.png",
  alt,
  ...props
}: ImgProps) {
  const { state, attach, onLoad, onError } = useImageLoadState(props.src);

  return (
    <>
      {state === "loading" && (
        <div className="animate-shimmer absolute inset-0" aria-hidden="true" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above:
          these are pre-sized Blob photos, so next/image would add a hop for
          nothing. */}
      <img
        {...props}
        alt={alt}
        ref={attach}
        // A broken photo shouldn't leave a hole where a dish should be; the
        // placeholder dish beats an alt-text stub on a menu card.
        src={state === "error" ? fallbackSrc : props.src}
        className={`${className} transition-opacity duration-300 ${
          state === "loaded" || state === "error" ? "opacity-100" : "opacity-0"
        }`}
        onLoad={onLoad}
        onError={onError}
      />
    </>
  );
}
