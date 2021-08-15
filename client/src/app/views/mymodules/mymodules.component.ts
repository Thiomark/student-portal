import { Component, Input, OnInit } from '@angular/core';
import { CourseService } from 'src/app/services/course.service';
import { PortalService } from 'src/app/services/portal.service';

@Component({
  selector: 'app-mymodules',
  templateUrl: './mymodules.component.html',
  styleUrls: ['./mymodules.component.scss']
})
export class MymodulesComponent implements OnInit {

  myModules: any [] = []; 
  fornow: string = 'disd1234' //! remove later
  tableHeaderClass: string = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
  tableItemClass: string = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500 text'
  constructor(private course: PortalService) { }

  ngOnInit(): void {
    this.course.fetch('modules/disd1234')
    .subscribe((response: any) => {
      this.myModules = response.rows
    })
  }

}