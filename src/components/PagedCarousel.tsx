import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { A11y, Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import './paged-carousel.css';

interface Props {
  page: number;
  count: number;
  onPageChange: (page: number) => void;
  children: (page: number) => ReactNode;
  label: string;
  className?: string;
  rewind?: boolean;
}

/** Swiper's standard React slide template; Swiper owns gestures and motion. */
export function PagedCarousel({ page, count, onPageChange, children, label, className = '', rewind = false }: Props) {
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const reduced = useReducedMotion();
  const speed = reduced ? 0 : 300;

  // Keep existing filters, desktop buttons and restored visits in sync.
  useEffect(() => {
    if (swiper && !swiper.destroyed && swiper.activeIndex !== page) swiper.slideTo(page, speed);
  }, [swiper, page, speed]);
  useLayoutEffect(() => {
    // Do not reset Swiper's transition duration while a slide is moving.
    if (swiper && !swiper.destroyed) swiper.updateAutoHeight();
  });

  return <Swiper
    className={`paged-carousel ${className}`}
    aria-label={label}
    modules={[A11y, Mousewheel]}
    slidesPerView={1}
    spaceBetween={16}
    initialSlide={page}
    speed={speed}
    autoHeight
    nested
    // Result rows are buttons: allow them to drag without treating them as text fields.
    focusableElements="input, select, option, textarea, video, label"
    touchStartPreventDefault={false}
    rewind={rewind}
    mousewheel={{ forceToAxis: true, releaseOnEdges: true, noMousewheelClass: 'atlas-plot' }}
    noSwipingSelector="input, select, textarea, [contenteditable='true'], [data-no-page-swipe], .atlas-plot, .pairing-matrix-wrap"
    breakpoints={{ 861: { simulateTouch: false } }}
    onSwiper={setSwiper}
    onSlideChange={instance => onPageChange(instance.activeIndex)}
  >
    {Array.from({ length: count }, (_, index) => <SwiperSlide
      key={index}
      aria-hidden={index !== page}
      onClickCapture={event => {
        // Swiper React reserves container on* props for library events; capture on the DOM slide.
        if (swiper && !swiper.allowClick) { event.preventDefault(); event.stopPropagation(); }
      }}
      {...(index !== page ? { inert: '' } : {})}
    >{children(index)}</SwiperSlide>)}
  </Swiper>;
}
