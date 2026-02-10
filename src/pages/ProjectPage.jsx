import { useLoaderData } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import MediaCard from "../components/MediaCard";

export default function ProjectPage() {
  const { project } = useLoaderData();

  return (
    <div className="pt-16 project space-y-8 lg:space-y-30">
      <div className="pl-0 lg:pl-4 hidden lg:block">
        {project.gallery && (
          <Swiper spaceBetween={16} slidesPerView={4.5}>
            {project.gallery.map((item) => (
              <SwiperSlide key={item.id}>
                <MediaCard {...item} />
              </SwiperSlide>
            ))}
          </Swiper>
        )}
      </div>

      <div className="px-8 lg:px-4 grid grid-cols-3 lg:grid-cols-2 lg:w-1/2">
        <div>Project info</div>
        <div className="space-y-12 col-span-2 lg:col-span-1">
          <p>{project.description}</p>
          <div className="space-x-4">
            <button type="button">Link</button>
            <button type="button">Share</button>
          </div>
        </div>
      </div>

      {project.gallery && (
        <div className="block lg:hidden px-8 space-y-4">
          {project.gallery.map((item) => (
            <MediaCard key={item.id} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}
