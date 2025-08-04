// src/components/KanbanColumn.tsx
import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";

interface Card {
  id: string;
  title: string;
  client_name: string;
  deal_value: number | null;
  stage_id: string;
}

interface KanbanColumnProps {
  columnId: string;
  columnTitle: string;
  cards: Card[];
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  columnId,
  columnTitle,
  cards,
}) => {
  const sortedCards = [...cards].sort((a, b) => (a.kanban_position ?? 0) - (b.kanban_position ?? 0));

  return (
    <div className="bg-gray-100 rounded-lg p-3 shadow-sm min-w-[240px] max-w-[280px] flex flex-col">
      <h2 className="text-xs font-bold mb-3 text-center uppercase tracking-wide text-gray-700">
        {columnTitle}
      </h2>
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 transition-all duration-200 min-h-[100px] ${
              snapshot.isDraggingOver ? "bg-blue-100" : ""
            }`}
          >
            {sortedCards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`bg-white p-2 rounded shadow-sm mb-2 transition-all text-xs ${
                      snapshot.isDragging ? "bg-yellow-100" : ""
                    }`}
                  >
                    <div className="font-semibold text-sm mb-0.5">
                      {card.title}
                    </div>
                    <div className="text-[11px] text-gray-600 mb-0.5">
                      {card.client_name}
                    </div>
                    <div className="text-[11px] font-semibold text-gray-800">
                      {typeof card.deal_value === "number"
                        ? card.deal_value.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 0,
                          })
                        : "--"}
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default KanbanColumn;
