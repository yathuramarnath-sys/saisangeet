import { useState, useEffect, useRef } from "react";
import { tapImpact } from "../lib/haptics";

const DEFAULT_NAMES = ["STARTERS", "MAINS", "DESSERTS", "SOUP & SALADS", "SIDES", "DRINKS"];

function loadCourses(tableId) {
  try { return JSON.parse(localStorage.getItem(`captain_courses_${tableId}`) || "null"); }
  catch { return null; }
}

function saveCourses(tableId, courses) {
  localStorage.setItem(`captain_courses_${tableId}`, JSON.stringify(courses));
}

export function CoursingScreen({ order, tableLabel, onBack }) {
  const items = (order.items || []).filter(i => !i.isVoided);

  const [courses, setCourses] = useState(() => {
    const saved = loadCourses(order.tableId);
    if (saved?.length) return saved;
    return [{ id: 1, name: "STARTERS", itemIds: items.map(i => i.id), firedAt: null }];
  });

  const itemIdKey = items.map(i => i.id).join(",");
  const prevItemIdKey = useRef(itemIdKey);

  useEffect(() => {
    if (prevItemIdKey.current === itemIdKey) return;
    prevItemIdKey.current = itemIdKey;
    const allAssigned = new Set(courses.flatMap(c => c.itemIds));
    const unassigned  = items.filter(i => !allAssigned.has(i.id));
    if (!unassigned.length) return;
    setCourses(prev => {
      const lastUnfired = [...prev].reverse().find(c => !c.firedAt);
      if (lastUnfired) {
        return prev.map(c =>
          c.id === lastUnfired.id
            ? { ...c, itemIds: [...c.itemIds, ...unassigned.map(i => i.id)] }
            : c
        );
      }
      const nextId = Math.max(...prev.map(c => c.id), 0) + 1;
      return [...prev, {
        id: nextId,
        name: DEFAULT_NAMES[nextId - 1] || `COURSE ${nextId}`,
        itemIds: unassigned.map(i => i.id),
        firedAt: null,
      }];
    });
  }, [itemIdKey]);

  useEffect(() => {
    saveCourses(order.tableId, courses);
  }, [courses, order.tableId]);

  function fireCourse(courseId) {
    tapImpact();
    const now = new Date();
    const h   = String(now.getHours()).padStart(2, "0");
    const m   = String(now.getMinutes()).padStart(2, "0");
    setCourses(prev =>
      prev.map(c => c.id === courseId ? { ...c, firedAt: `${h}:${m}` } : c)
    );
  }

  function addCourse() {
    tapImpact();
    const nextId = Math.max(...courses.map(c => c.id), 0) + 1;
    setCourses(prev => [...prev, {
      id: nextId,
      name: DEFAULT_NAMES[nextId - 1] || `COURSE ${nextId}`,
      itemIds: [],
      firedAt: null,
    }]);
  }

  const totalItems = items.length;

  return (
    <div className="crs-page">
      <div className="crs-header">
        <button className="crs-back-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="crs-header-text">
          <h2 className="crs-title">Coursing</h2>
          <p className="crs-subtitle">{tableLabel} · {totalItems} item{totalItems !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="crs-scroll">
        {courses.map((course, ci) => {
          const courseItems = items.filter(i => course.itemIds.includes(i.id));
          const isFired = !!course.firedAt;
          return (
            <div key={course.id} className={`crs-course-card${isFired ? " crs-fired" : " crs-onhold"}`}>
              <div className={`crs-course-header${isFired ? " crs-course-header-fired" : " crs-course-header-hold"}`}>
                <span className="crs-course-name">COURSE {ci + 1} · {course.name}</span>
                {isFired ? (
                  <span className="crs-fired-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#0C831F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Fired {course.firedAt}
                  </span>
                ) : (
                  <span className="crs-hold-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                    On hold
                  </span>
                )}
              </div>

              {courseItems.map(item => (
                <div key={item.id} className="crs-item-row">
                  <span className="crs-item-qty">{item.quantity}×</span>
                  <span className="crs-item-name">{item.name}</span>
                  <span className="crs-item-price">₹{(item.price * item.quantity).toFixed(0)}</span>
                </div>
              ))}

              {courseItems.length === 0 && !isFired && (
                <div className="crs-item-row" style={{ color: "#9CA3AF", fontSize: 13 }}>
                  <span style={{ flex: 1 }}>No items in this course yet</span>
                </div>
              )}

              {!isFired && (
                <button className="crs-fire-btn" onClick={() => fireCourse(course.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/>
                  </svg>
                  Fire this course
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="crs-bottom">
        <button className="crs-add-btn" onClick={addCourse}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add a course
        </button>
      </div>
    </div>
  );
}
