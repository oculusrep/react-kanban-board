import React, { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult
} from "@hello-pangea/dnd";

type Item = {
  id: string;
  content: string;
};

type Columns = {
  [key: string]: Item[];
};

const initialData: Columns = {
  LOI: [
    { id: "item-1", content: "Site A - Atlanta" },
    { id: "item-2", content: "Site B - Tampa" }
  ],
  PSA: [
    { id: "item-3", content: "Site C - Miami" }
  ],
  "Under Contract": [],
  Booked: [],
  Executed: [],
  Closed: []
};

export default function App() {
  const [columns, setColumns] = useState<Columns>(initialData);

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceColumn = columns[source.droppableId];
    const destColumn = columns[destination.droppableId];
    const [movedItem] = sourceColumn.splice(source.index, 1);

    destColumn.splice(destination.index, 0, movedItem);

    setColumns({
      ...columns,
      [source.droppableId]: [...sourceColumn],
      [destination.droppableId]: [...destColumn]
    });
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Kanban Board</h1>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(columns).map(([columnId, items]) => (
            <div key={columnId} className="bg-white rounded shadow p-2">
              <h2 className="font-semibold mb-2">{columnId}</h2>
              <Droppable droppableId={columnId}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`min-h-[100px] p-2 rounded transition-all duration-300 ${
                      snapshot.isDraggingOver ? "bg-blue-100" : "bg-gray-50"
                    }`}
                  >
                    {items.map((item, index) => (
                      <Draggable
                        key={item.id}
                        draggableId={item.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`mb-2 p-2 rounded bg-blue-200 shadow cursor-move transition-transform duration-200 ${
                              snapshot.isDragging ? "scale-105" : ""
                            }`}
                          >
                            {item.content}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
